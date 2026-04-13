/**
 * SwapButton.tsx
 *
 * The primary action button. Reflects every transaction state with a
 * distinct label and visual treatment. Receives state as props so it
 * stays a pure presentational component - all logic lives in SwapWidget.
 */

import { motion } from 'framer-motion';
import { NQLogoPendingAnimation } from '@/components/animations/NQLogoPendingAnimation';

export type SwapButtonState =
  | 'connect'
  | 'select_tokens'
  | 'enter_amount'
  | 'ready'
  | 'simulating'
  | 'awaiting_approval'
  | 'awaiting_confirmation'
  | 'success'
  | 'failed'
  | 'network_error';

const LABELS: Record<SwapButtonState, string> = {
  connect: 'Connect Wallet',
  select_tokens: 'Select tokens',
  enter_amount: 'Enter an amount',
  ready: 'Swap',
  simulating: 'Simulating…',
  awaiting_approval: 'Confirm in wallet',
  awaiting_confirmation: 'Transaction sent…',
  success: 'Swap successful',
  failed: 'Swap failed — Retry',
  network_error: 'Network error — Retry',
};

const ACTIVE_STATES: SwapButtonState[] = ['ready', 'failed', 'network_error', 'connect'];

interface SwapButtonProps {
  buttonState: SwapButtonState;
  onClick?: () => void;
  /** Block time in seconds — syncs animation speed to current chain */
  animationDuration?: number;
}

export function SwapButton({ buttonState, onClick, animationDuration = 12 }: SwapButtonProps) {
  const isDisabled = !ACTIVE_STATES.includes(buttonState);
  const isSuccess = buttonState === 'success';
  const isFailed = buttonState === 'failed' || buttonState === 'network_error';
  const isPending =
    buttonState === 'simulating' ||
    buttonState === 'awaiting_approval' ||
    buttonState === 'awaiting_confirmation';

  const bgClass = isSuccess
    ? 'bg-nq-success'
    : isFailed
    ? 'bg-nq-error/90 hover:bg-nq-error'
    : buttonState === 'connect'
    ? 'bg-nq-accent hover:bg-violet-600 active:bg-violet-700'
    : isDisabled
    ? 'bg-nq-border'
    : 'bg-nq-accent hover:bg-violet-600 active:bg-violet-700';

  return (
    <motion.button
      onClick={!isDisabled ? onClick : undefined}
      disabled={isDisabled}
      whileTap={!isDisabled ? { scale: 0.98 } : undefined}
      aria-label={LABELS[buttonState]}
      className={[
        'relative w-full py-4 rounded-2xl font-semibold text-base',
        'text-white transition-all duration-200',
        'focus-visible:ring-2 focus-visible:ring-nq-accent focus-visible:ring-offset-2 focus-visible:ring-offset-nq-surface',
        isDisabled && !isFailed ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        bgClass,
      ].join(' ')}
    >
      <span className="flex items-center justify-center gap-2">
        {isPending && (
          <span aria-hidden="true" className="flex items-center justify-center">
            <NQLogoPendingAnimation
              animationDuration={animationDuration}
              isActive={isPending}
              size={40}
              color="rgba(255,255,255,0.95)"
            />
          </span>
        )}
        {isSuccess && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 8L6.5 11.5L13 4.5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {LABELS[buttonState]}
      </span>
    </motion.button>
  );
}
