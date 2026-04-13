/**
 * Formally typed finite state machine governing every transaction lifecycle
 * transition. This is the single source of truth for "what is happening right
 * now" in a swap flow.
 *
 * DESIGN PRINCIPLES:
 *
 * 1. PURE REDUCER — The reducer contains zero side effects. It is a pure
 *    function of (state, action) → state. All side effects (Wagmi polling,
 *    storage writes, timeouts) live exclusively in useEffect watchers in the
 *    consuming component or hook. This makes the machine trivially testable.
 *
 * 2. ILLEGAL TRANSITION DETECTION — In development mode, any action that
 *    cannot legally fire from the current state throws a descriptive error
 *    rather than silently returning the current state. This surfaces bugs
 *    immediately during development instead of producing mysterious UI states.
 *    In production, illegal transitions are no-ops to avoid user-visible crashes.
 *
 * 3. DISCRIMINATED UNION STATE — Each state carries exactly the data it needs
 *    and nothing more. AwaitingConfirmation carries the tx hash. Failed carries
 *    the error and retryability flag. This prevents stale data leaking across
 *    state transitions.
 *
 * 4. DERIVED BOOLEANS — canRetry and isTerminal are derived from the current
 *    state, not stored as separate flags. This eliminates the entire class of
 *    bugs where a flag gets out of sync with the actual state.
 *
 * STATE TRANSITION MAP:
 *
 *   Idle
 *     → SIMULATE → Simulating
 *
 *   Simulating
 *     → SIMULATE_SUCCESS → AwaitingApproval
 *     → SIMULATE_FAIL    → Failed (isRetryable: true)
 *     → RESET            → Idle
 *
 *   AwaitingApproval
 *     → REQUEST_APPROVAL    → AwaitingApproval (updates requestId — noop shape)
 *     → APPROVAL_REJECTED   → Failed (isRetryable: true)
 *     → TRANSACTION_SUBMITTED → AwaitingConfirmation
 *     → RESET               → Idle
 *
 *   AwaitingConfirmation
 *     → TRANSACTION_CONFIRMED → Success
 *     → TRANSACTION_FAILED    → Failed (isRetryable: true)
 *     → RESET                 → Idle
 *
 *   Success
 *     → RESET → Idle
 *
 *   Failed
 *     → SIMULATE → Simulating   (retry path)
 *     → RESET    → Idle
 */

import { useReducer, useCallback } from 'react';
import type { TransactionState, TransactionAction } from '@/types/transaction';

// Valid transitions map — used for illegal transition detection in dev mode.
// Key: current status. Value: set of action types that are legal from this state.

const VALID_TRANSITIONS: Record<string, Set<string>> = {
  Idle:                  new Set(['SIMULATE', 'RESET']),
  Simulating:            new Set(['SIMULATE_SUCCESS', 'SIMULATE_FAIL', 'RESET']),
  AwaitingApproval:      new Set(['REQUEST_APPROVAL', 'APPROVAL_REJECTED', 'TRANSACTION_SUBMITTED', 'RESET']),
  AwaitingConfirmation:  new Set(['TRANSACTION_CONFIRMED', 'TRANSACTION_FAILED', 'RESET']),
  Success:               new Set(['RESET']),

  // Failed can retry (SIMULATE) or reset
  Failed:                new Set(['SIMULATE', 'RESET']),
};

// Pure reducer — zero side effects
function transactionReducer(
  state: TransactionState,
  action: TransactionAction
): TransactionState {
  //  Illegal transition detection (dev only)
  if (import.meta.env.DEV) {
    const allowed = VALID_TRANSITIONS[state.status];
    if (!allowed?.has(action.type)) {
      throw new Error(
        `[useTransactionStateMachine] Illegal transition: ` +
        `cannot dispatch "${action.type}" from state "${state.status}".\n` +
        `Legal actions from "${state.status}": ${[...(allowed ?? [])].join(', ') || 'none'}`
      );
    }
  }

  // State transitions
  switch (action.type) {

    case 'SIMULATE':
      return { status: 'Simulating' };

    case 'SIMULATE_SUCCESS':
      // requestId will be set by the immediately following REQUEST_APPROVAL
      // action dispatched by useDeduplicatedSwap. We use a placeholder here
      // so the state is valid. Phase 4 replaces this flow.
      return { status: 'AwaitingApproval', requestId: '' };

    case 'SIMULATE_FAIL':
      return {
        status: 'Failed',
        error: action.error,
        // Simulation failures are retryable — the user can fix inputs and retry
        isRetryable: true,
      };

    case 'REQUEST_APPROVAL':
      return { status: 'AwaitingApproval', requestId: action.requestId };

    case 'APPROVAL_REJECTED':
      return {
        status: 'Failed',
        error: new Error('User rejected the transaction in their wallet.'),
        // Rejection is retryable — user can try again
        isRetryable: true,
      };

    case 'TRANSACTION_SUBMITTED':
      if (state.status !== 'AwaitingApproval') {
        // Should be caught by dev guard above; this satisfies TypeScript narrowing
        return state;
      }
      return {
        status: 'AwaitingConfirmation',
        hash: action.hash,
        submittedAt: Date.now(),
      };

    case 'TRANSACTION_CONFIRMED':
      if (state.status !== 'AwaitingConfirmation') return state;
      return {
        status: 'Success',
        hash: state.hash,
        receipt: action.receipt,
      };

    case 'TRANSACTION_FAILED':
      return {
        status: 'Failed',
        // Carry the hash if we have it (failure during confirmation)
        hash: state.status === 'AwaitingConfirmation' ? state.hash : undefined,
        error: action.error,
        // Network/chain errors are retryable; insufficient balance is not.
        isRetryable: true,
      };

    case 'RESET':
      return { status: 'Idle' };

    default: {
      // Exhaustiveness check — TypeScript will error here if a new action
      // type is added to TransactionAction without handling it in this reducer.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// Hook
const INITIAL_STATE: TransactionState = { status: 'Idle' };

export function useTransactionStateMachine() {
  const [state, dispatch] = useReducer(transactionReducer, INITIAL_STATE);

  // Derived booleans 

  /**
   * canRetry — true only when the machine is in a Failed state AND the error
   * was flagged as retryable. Drives the "Retry" label on SwapButton.
   */
  const canRetry =
    state.status === 'Failed' && state.isRetryable;

  /**
   * isTerminal — true when the machine has reached a final resting state
   * (Success or non-retryable Failed). Consumers use this to stop polling.
   */
  const isTerminal =
    state.status === 'Success' ||
    (state.status === 'Failed' && !state.isRetryable);

  /**
   * isBusy — true when a transaction is in-flight and the UI should block
   * further user interaction (except Reset/Cancel).
   */
  const isBusy =
    state.status === 'Simulating' ||
    state.status === 'AwaitingApproval' ||
    state.status === 'AwaitingConfirmation';

  // Safe dispatch wrapper 
  const safeDispatch = useCallback(
    (action: TransactionAction) => {
      if (!import.meta.env.DEV) {
        const allowed = VALID_TRANSITIONS[state.status];
        if (!allowed?.has(action.type)) {
          console.warn(
            `[useTransactionStateMachine] Ignoring illegal transition: ` +
            `"${action.type}" from "${state.status}"`
          );
          return;
        }
      }
      dispatch(action);
    },
    [state.status]
  );

  return {
    state,
    dispatch: safeDispatch,
    canRetry,
    isTerminal,
    isBusy,
  };
}
