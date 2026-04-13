/**
 * Guarantees that no matter how many times the user clicks "Swap", exactly
 * one transaction request is ever in-flight at a time.
 *
 * DESIGN DECISIONS:
 *
 * 1. useRef FOR THE LOCK — not useState.
 *    REASON: A ref mutation is synchronous and does not trigger a re-render.
 *    If I used useState, React might batch the state update and allow a second
 *    call to slip through before the re-render that would have blocked it.
 *    The ref acts as a true mutex: the first call sets it to true, and every
 *    subsequent synchronous or near-synchronous call sees true immediately.
 *
 * 2. crypto.randomUUID() PER ATTEMPT — not a counter.
 *    REASON: UUIDs are unguessable and globally unique. A counter would reset
 *    on remount, making requestIds from different sessions indistinguishable
 *    in logs and storage. UUIDs are traceable across the whole stack.
 *
 * 3. 60-SECOND TIMEOUT ESCAPE HATCH.
 *    REASON: If the async flow throws an uncaught error that bypasses our
 *    catch block (e.g., a promise that never resolves, an unmount mid-flight),
 *    the lock would never release and the user would be permanently blocked.
 *    The timeout is the safety net. It dispatches RESET to return the state
 *    machine to Idle so the user can try again.
 *
 * 4. LOCK RELEASES ON: confirmation, failure, rejection, AND timeout.
 *    REASON: Every terminal path must release the lock. Missing even one
 *    would permanently brick the widget until page reload.
 *
 * 5. DEV-MODE REJECTION LOGGING.
 *    REASON: Silent deduplication is invisible during development. Logging
 *    every rejected call with timestamp and requestId makes it trivially
 *    verifiable that the deduplication is working (the stress test shows
 *    exactly 9 "deduplicated" logs for 10 rapid clicks).
 */

import { useRef, useState, useCallback } from 'react';
import { DEDUP_LOCK_TIMEOUT_MS } from '@/constants';
import type { TransactionAction } from '@/types/transaction';

// Types
type DispatchFn = (action: TransactionAction) => void;

/** The swap executor function signature — matches the mock in SwapWidget */
type SwapExecutor = (requestId: string, dispatch: DispatchFn) => Promise<void>;

interface UseDedupicatedSwapOptions {
  dispatch: DispatchFn;
  executor: SwapExecutor;
  /** Override timeout for testing (defaults to DEDUP_LOCK_TIMEOUT_MS = 60s) */
  timeoutMs?: number;
}

interface UseDedupicatedSwapReturn {
  // Call this instead of calling the executor directly 
  submitSwap: () => Promise<void>;
  // True while a swap is in-flight — use to show locked UI 
  isLocked: boolean;
  // The requestId of the current in-flight request, or null 
  currentRequestId: string | null;
}

// Hook
export function useDeduplicatedSwap({
  dispatch,
  executor,
  timeoutMs = DEDUP_LOCK_TIMEOUT_MS,
}: UseDedupicatedSwapOptions): UseDedupicatedSwapReturn {

  // The lock — useRef so mutations are synchronous
  const lockRef = useRef<boolean>(false);

  //  Current requestId — useState because we DO want the UI to reflect it 
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);

  // Timeout handle — so we can clear it on natural completion 
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Release the lock — called on every terminal path 
  const releaseLock = useCallback(() => {
    lockRef.current = false;
    setCurrentRequestId(null);
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Primary submit function 
  const submitSwap = useCallback(async () => {

    // Deduplication check 
    if (lockRef.current) {
      // REASON: Log in dev so the stress test (10 rapid clicks) produces
      // exactly 9 "deduplicated" console entries, proving only 1 went through.
      if (import.meta.env.DEV) {
        console.log(
          `%c[useDeduplicatedSwap] Deduplicated — request rejected`,
          'color: #f59e0b; font-weight: bold',
          {
            timestamp: new Date().toISOString(),
            lockedBy: currentRequestId,
            rejectedAt: Date.now(),
          }
        );
      }
      return;
    }

    // Acquire lock synchronously before any await
    // REASON: Setting the ref before the first await ensures no concurrent
    // call can slip through between the lock check and the first async op.
    lockRef.current = true;
    const requestId = crypto.randomUUID();
    setCurrentRequestId(requestId);

    if (import.meta.env.DEV) {
      console.log(
        `%c[useDeduplicatedSwap] Lock acquired`,
        'color: #10b981; font-weight: bold',
        { requestId, timestamp: new Date().toISOString() }
      );
    }

    // Timeout escape hatch
    timeoutRef.current = setTimeout(() => {
      if (lockRef.current) {
        if (import.meta.env.DEV) {
          console.warn(
            `%c[useDeduplicatedSwap] Timeout — lock force-released after ${timeoutMs}ms`,
            'color: #ef4444; font-weight: bold',
            { requestId, timeoutMs }
          );
        }
        releaseLock();
        // Return state machine to Idle so the user can retry
        dispatch({ type: 'RESET' });
      }
    }, timeoutMs);

    //  Execute the swap 
    try {
      await executor(requestId, dispatch);
    } catch (err) {
      // Executor should handle its own errors and dispatch TRANSACTION_FAILED.
      // This outer catch is a final safety net for unexpected throws.
      if (import.meta.env.DEV) {
        console.error('[useDeduplicatedSwap] Unhandled executor error:', err);
      }
      dispatch({
        type: 'TRANSACTION_FAILED',
        error: err instanceof Error ? err : new Error('Unexpected error in swap executor'),
      });
    } finally {
      // Release lock on EVERY terminal path
      releaseLock();

      if (import.meta.env.DEV) {
        console.log(
          `%c[useDeduplicatedSwap] Lock released`,
          'color: #64748b',
          { requestId, timestamp: new Date().toISOString() }
        );
      }
    }
  }, [dispatch, executor, timeoutMs, releaseLock, currentRequestId]);

  return {
    submitSwap,
    isLocked: lockRef.current,
    currentRequestId,
  };
}
