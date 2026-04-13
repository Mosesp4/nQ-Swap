/**
 * Slide-down banner that appears when the user returns to the page with an
 * unresolved pending transaction. Shows transaction details, elapsed time,
 * live recovery status, and a dismiss button.
 *
 * Only renders during active recovery — returns null otherwise, so it has
 * zero layout impact during normal swap flows.
 *
 * ANIMATION: Framer Motion slide from y: -80 - y: 0 on enter,
 * y: 0 - y: -80 on exit. Spring physics for a native-app feel.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PendingTransaction } from '@/lib/transactionStorage';

// Props — passed from SwapWidget which owns recovery state

interface RecoveryBannerProps {
  isRecovering: boolean;
  transaction: PendingTransaction | null;
  onDismiss: () => void;
}


// Elapsed time — live updating every second

function useElapsedTime(timestamp: number | null): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (timestamp === null) return;
    // Capture in a non-null local so the closure is correctly typed
    const ts: number = timestamp;

    function update() {
      const seconds = Math.floor((Date.now() - ts) / 1000);
      if (seconds < 60) {
        setElapsed(`${seconds}s ago`);
      } else if (seconds < 3600) {
        setElapsed(`${Math.floor(seconds / 60)}m ago`);
      } else {
        setElapsed(`${Math.floor(seconds / 3600)}h ago`);
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return elapsed;
}


// Copy to clipboard button
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — fail silently
    }
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : 'Copy transaction hash'}
      title={copied ? 'Copied!' : 'Copy full hash'}
      className="ml-1 text-nq-muted hover:text-nq-text transition-colors"
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path
                d="M2 6.5L5 9.5L11 3.5"
                stroke="#10b981"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25"/>
              <path
                d="M3 8.5H2.5A1.5 1.5 0 011 7V2.5A1.5 1.5 0 012.5 1H7A1.5 1.5 0 018.5 2.5V3"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}


// Status indicator
function StatusIndicator({ status }: { status: PendingTransaction['status'] }) {
  if (status === 'confirmed') {
    return (
      <span className="flex items-center gap-1 text-nq-success text-xs font-medium">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Confirmed
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-nq-error text-xs font-medium">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Swap failed
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-nq-accent-light text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-nq-accent animate-pulse" />
      Watching for confirmation…
    </span>
  );
}

// Chain explorer URL helper
const EXPLORER_URLS: Record<number, string> = {
  1:     'https://etherscan.io',
  137:   'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  10:    'https://optimistic.etherscan.io',
  8453:  'https://basescan.org',
};

function getExplorerUrl(chainId: number, hash: string): string {
  const base = EXPLORER_URLS[chainId] ?? 'https://etherscan.io';
  return `${base}/tx/${hash}`;
}

// Banner component

export function RecoveryBanner({ isRecovering, transaction, onDismiss }: RecoveryBannerProps) {
  const elapsed = useElapsedTime(transaction ? transaction.timestamp : null);

  return (
    <AnimatePresence>
      {isRecovering && transaction && (
        <motion.div
          key="recovery-banner"
          role="status"
          aria-live="polite"
          aria-label="Pending transaction recovery"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{
            type: 'spring',
            stiffness: 320,
            damping: 28,
          }}
          className={[
            'mb-3 rounded-2xl border px-4 py-3',
            'bg-nq-surface shadow-lg shadow-black/30',
            transaction.status === 'confirmed'
              ? 'border-nq-success/40'
              : transaction.status === 'failed'
              ? 'border-nq-error/40'
              : 'border-nq-accent/40',
          ].join(' ')}
        >
          {/* Top row: label + dismiss */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle
                  cx="7" cy="7" r="6"
                  stroke={
                    transaction.status === 'confirmed' ? '#10b981'
                    : transaction.status === 'failed'  ? '#ef4444'
                    : '#7c3aed'
                  }
                  strokeWidth="1.5"
                />
                <path
                  d="M7 4v3.5l2 1.5"
                  stroke={
                    transaction.status === 'confirmed' ? '#10b981'
                    : transaction.status === 'failed'  ? '#ef4444'
                    : '#7c3aed'
                  }
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-nq-text text-xs font-semibold">
                Pending transaction restored
              </span>
            </div>
            <button
              onClick={onDismiss}
              aria-label="Dismiss recovery banner"
              className="w-6 h-6 flex items-center justify-center rounded-lg text-nq-muted hover:text-nq-text hover:bg-white/5 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <path
                  d="M1 1L10 10M10 1L1 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Transaction details */}
          <div className="flex items-center justify-between mb-2">
            {/* Hash + copy + explorer link */}
            <div className="flex items-center gap-1 font-mono text-xs text-nq-muted">
              <span className="text-nq-text">
                {transaction.hash.slice(0, 6)}…{transaction.hash.slice(-4)}
              </span>
              <CopyButton text={transaction.hash} />
              <a
                href={getExplorerUrl(transaction.chainId, transaction.hash)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View on block explorer"
                title="View on block explorer"
                className="ml-0.5 text-nq-accent-light hover:text-nq-accent transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                  <path
                    d="M4.5 1.5H9.5M9.5 1.5V6.5M9.5 1.5L4 7M2 4H1.5A.5.5 0 001 4.5v5a.5.5 0 00.5.5h5a.5.5 0 00.5-.5V9"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>

            {/* Elapsed time */}
            <span className="text-nq-muted text-xs">{elapsed}</span>
          </div>

          {/* Token route */}
          <div className="flex items-center justify-between">
            <span className="text-nq-muted text-xs">
              {transaction.amountIn} {transaction.tokenIn}
              <span className="mx-1.5 text-nq-border">→</span>
              {transaction.tokenOut}
            </span>
            <StatusIndicator status={transaction.status} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
