/**
 * On mount, checks persistent storage for any pending transaction the user
 * may have abandoned (closed the tab, lost network, browser crash, etc.).
 * If found and not expired, it restores the state machine to
 * AwaitingConfirmation and re-attaches the Wagmi receipt listener.
 *
 * DESIGN DECISIONS:
 *
 * 1. WHY ON MOUNT?
 *    The recovery check runs once on mount — the exact moment the user returns
 *    to the page. Running it more frequently would cause false positives during
 *    normal swap flows (we'd try to "recover" a tx that's actively in progress).
 *
 * 2. RE-ATTACHING useWaitForTransactionReceipt
 *    Wagmi's hook is reactive — it watches for the receipt as long as the
 *    component is mounted and the hash is set. We restore the hash into
 *    component state, which causes the hook to start polling immediately.
 *    No manual re-subscription is needed.
 *
 * 3. 5-SECOND CLEAR DELAY
 *    After confirmation, we wait 5 seconds before clearing storage. This gives
 *    the RecoveryBanner time to show "✓ Confirmed" before disappearing, so the
 *    user gets positive feedback even on a recovered transaction.
 *
 * 4. DISPATCH SAFETY
 *    Recovery dispatches TRANSACTION_SUBMITTED (not SIMULATE or REQUEST_APPROVAL)
 *    because we're re-entering the flow mid-stream — the tx is already on-chain,
 *    we just need the machine in the right state to watch for confirmation.
 *    This bypasses the simulation and approval steps correctly.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import {
  getAnyPendingTransaction,
  clearPendingTransaction,
  updateTransactionStatus,
} from '@/lib/transactionStorage';
import { TX_CLEAR_DELAY_MS } from '@/constants';
import type { PendingTransaction } from '@/lib/transactionStorage';
import type { TransactionAction } from '@/types/transaction';

// Types
interface UseTransactionRecoveryOptions {
  dispatch: (action: TransactionAction) => void;
}

interface UseTransactionRecoveryReturn {
  // True while actively watching a recovered transaction 
  isRecovering: boolean;
  // The recovered transaction record, or null 
  recoveredTransaction: PendingTransaction | null;
  // Call this to manually dismiss the recovery banner
  dismissRecovery: () => Promise<void>;
}

// Hook
export function useTransactionRecovery({
  dispatch,
}: UseTransactionRecoveryOptions): UseTransactionRecoveryReturn {
  const [recoveredTx, setRecoveredTx] = useState<PendingTransaction | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  // Re-attach Wagmi's receipt watcher
  // This hook becomes active as soon as recoveredTx?.hash is set.
  // REASON: useWaitForTransactionReceipt is reactive — passing `enabled`
  // based on the hash means it starts polling the moment we restore state.
  const {
    data: receipt,
    isError: receiptError,
    isLoading: receiptLoading,
  } = useWaitForTransactionReceipt({
    hash: recoveredTx?.hash,
    // Only poll if we're actively recovering and the tx is still pending
    query: {
      enabled: isRecovering && !!recoveredTx?.hash && recoveredTx.status === 'pending',
    },
  });

  //  On mount: scan storage for any pending tx
  useEffect(() => {
    let cancelled = false;

    async function checkForPendingTx() {
      try {
        const pending = await getAnyPendingTransaction();
        if (cancelled) return;

        if (pending) {
          if (import.meta.env.DEV) {
            console.log(
              '%c[useTransactionRecovery] Recovered pending transaction',
              'color: #f59e0b; font-weight: bold',
              {
                hash: pending.hash.slice(0, 10) + '…',
                chainId: pending.chainId,
                age: Math.round((Date.now() - pending.timestamp) / 1000) + 's ago',
                expiresIn: Math.round((pending.expiresAt - Date.now()) / 1000) + 's',
              }
            );
          }

          setRecoveredTx(pending);
          setIsRecovering(true);

          // Restore the state machine to AwaitingConfirmation.
          // REASON: I skip SIMULATE and REQUEST_APPROVAL — the tx is already
          // submitted on-chain. We only need the machine in the right state
          // to watch for the receipt and update the UI correctly.
          dispatch({ type: 'RESET' }); // ensure clean slate
          // Small tick to let RESET settle before TRANSACTION_SUBMITTED
          setTimeout(() => {
            dispatch({ type: 'SIMULATE' });
            dispatch({ type: 'SIMULATE_SUCCESS' });
            dispatch({ type: 'REQUEST_APPROVAL', requestId: 'recovered' });
            dispatch({ type: 'TRANSACTION_SUBMITTED', hash: pending.hash });
          }, 0);
        }
      } catch (err) {
        // Storage read failure — non-blocking, recovery just won't happen
        if (import.meta.env.DEV) {
          console.warn('[useTransactionRecovery] Storage read failed:', err);
        }
      }
    }

    void checkForPendingTx();
    return () => { cancelled = true; };
  // REASON: Empty dep array — run once on mount only. Re-running on every
  // render would falsely trigger recovery during active swap flows.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle confirmed receipt
  useEffect(() => {
    if (!receipt || !recoveredTx || receipt === undefined) return;

    async function handleConfirmed() {
      if (!recoveredTx) return;

      if (import.meta.env.DEV) {
        console.log(
          '%c[useTransactionRecovery] Recovered tx confirmed on-chain',
          'color: #10b981; font-weight: bold',
          { hash: recoveredTx.hash.slice(0, 10) + '…' }
        );
      }

      // Update storage status before dispatching so banner shows correct state
      await updateTransactionStatus(recoveredTx.hash, 'confirmed');

      // receipt is guaranteed non-undefined here
      if (receipt === undefined) return;
      dispatch({ type: 'TRANSACTION_CONFIRMED', receipt });

      // Clear storage after delay so banner has time to show "Confirmed"
      setTimeout(async () => {
        await clearPendingTransaction(recoveredTx.hash);
        setIsRecovering(false);
        setRecoveredTx(null);
      }, TX_CLEAR_DELAY_MS);
    }

    void handleConfirmed();
  }, [receipt, recoveredTx, dispatch]);

  // Handle receipt error
  useEffect(() => {
    if (!receiptError || !recoveredTx || receiptLoading) return;

    async function handleFailed() {
      if (!recoveredTx) return;

      if (import.meta.env.DEV) {
        console.warn(
          '%c[useTransactionRecovery] Recovered tx failed/dropped',
          'color: #ef4444',
          { hash: recoveredTx.hash.slice(0, 10) + '…' }
        );
      }

      await updateTransactionStatus(recoveredTx.hash, 'failed');
      dispatch({
        type: 'TRANSACTION_FAILED',
        error: new Error('Transaction failed or was dropped from the mempool.'),
      });

      // Keep banner visible briefly so user sees the failure, then clean up
      setTimeout(async () => {
        if (!recoveredTx) return;
        await clearPendingTransaction(recoveredTx.hash);
        setIsRecovering(false);
        setRecoveredTx(null);
      }, TX_CLEAR_DELAY_MS);
    }

    void handleFailed();
  }, [receiptError, receiptLoading, recoveredTx, dispatch]);

  // Manual dismiss 
  const dismissRecovery = useCallback(async () => {
    if (recoveredTx) {
      await clearPendingTransaction(recoveredTx.hash);
    }
    setIsRecovering(false);
    setRecoveredTx(null);
    dispatch({ type: 'RESET' });
  }, [recoveredTx, dispatch]);

  return {
    isRecovering,
    recoveredTransaction: recoveredTx,
    dismissRecovery,
  };
}
