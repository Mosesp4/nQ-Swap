import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useChainId } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { TokenSelector } from './TokenSelector';
import { SwapButton } from './SwapButton';
import { wagmiConfig } from '@/lib/wagmiConfig';
import type { SwapButtonState } from './SwapButton';
import { RecoveryBanner } from './RecoveryBanner';
import { SLIPPAGE_PRESETS, DEFAULT_SLIPPAGE, TX_TTL_MS } from '@/constants';
import type { Token, TransactionAction } from '@/types/transaction';
import { useTransactionStateMachine } from '@/hooks/useTransactionStateMachine';
import { useDeduplicatedSwap } from '@/hooks/useDeduplicatedSwap';
import { useTransactionRecovery } from '@/hooks/useTransactionRecovery';
import { useBlockTime } from '@/hooks/useBlockTime';
import { NQLogoPendingAnimation } from '@/components/animations/NQLogoPendingAnimation';
import { useToast, ToastContainer } from '@/components/ui/Toast';

import {
  savePendingTransaction,
  clearPendingTransaction,
} from '@/lib/transactionStorage';

// Sub-components

interface AmountInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  label: string;
}

function AmountInput({
  value, onChange, placeholder = '0.0', disabled, hasError, label,
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) onChange(raw);
  };
  return (
    <div onClick={() => inputRef.current?.focus()} className="flex-1 cursor-text">
      <label className="sr-only">{label}</label>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        aria-invalid={hasError}
        className={[
          'w-full bg-transparent text-right text-2xl font-semibold',
          'placeholder:text-nq-muted/40 disabled:cursor-not-allowed',
          'transition-colors duration-150',
          hasError ? 'text-nq-error' : 'text-nq-text',
        ].join(' ')}
      />
      {hasError && value !== '' && (
        <p className="text-nq-error text-xs text-right mt-1" role="alert">
          Insufficient balance
        </p>
      )}
    </div>
  );
}

interface SlippageRowProps { value: number; onChange: (val: number) => void; }
function SlippageRow({ value, onChange }: SlippageRowProps) {
  const [isCustom, setIsCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const handlePreset = (p: number) => { setIsCustom(false); setCustomInput(''); onChange(p); };
  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      setCustomInput(raw);
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0 && n <= 50) onChange(n);
    }
  };
  const isPresetActive = (p: number) => !isCustom && value === p;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-nq-muted text-xs font-medium shrink-0">Slippage</span>
      <div className="flex items-center gap-1">
        {SLIPPAGE_PRESETS.map((p) => (
          <button key={p} onClick={() => handlePreset(p)} aria-pressed={isPresetActive(p)}
            className={['px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150',
              isPresetActive(p) ? 'bg-nq-accent text-white'
              : 'bg-nq-bg text-nq-muted hover:text-nq-text hover:bg-white/5 border border-nq-border',
            ].join(' ')}>
            {p}%
          </button>
        ))}
        <div className={['flex items-center rounded-lg border text-xs overflow-hidden transition-all duration-150',
          isCustom ? 'border-nq-accent/60' : 'border-nq-border'].join(' ')}>
          <input type="text" inputMode="decimal" value={customInput}
            onChange={handleCustomChange} onFocus={() => setIsCustom(true)}
            placeholder="Custom" aria-label="Custom slippage tolerance"
            className="w-14 px-2 py-1 bg-nq-bg text-nq-text placeholder:text-nq-muted/60 text-center" />
          {isCustom && customInput && <span className="pr-2 text-nq-muted bg-nq-bg py-1">%</span>}
        </div>
      </div>
    </div>
  );
}

interface SwapArrowProps { onClick: () => void; disabled?: boolean; }
function SwapArrow({ onClick, disabled }: SwapArrowProps) {
  const [rotated, setRotated] = useState(false);
  const handleClick = () => { if (disabled) return; setRotated((r) => !r); onClick(); };
  return (
    <div className="flex items-center justify-center py-1 relative z-10">
      <motion.button onClick={handleClick} disabled={disabled} aria-label="Swap token positions"
        whileHover={!disabled ? { scale: 1.1 } : undefined}
        whileTap={!disabled ? { scale: 0.9 } : undefined}
        animate={{ rotate: rotated ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={['w-9 h-9 rounded-xl border border-nq-border bg-nq-surface',
          'flex items-center justify-center shadow-lg shadow-black/30 transition-colors duration-150',
          disabled ? 'cursor-not-allowed opacity-40'
          : 'hover:border-nq-accent/50 hover:bg-nq-accent/5 cursor-pointer',
        ].join(' ')}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2L8 14M4 10L8 14L12 10" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.button>
    </div>
  );
}

interface TokenPanelProps {
  label: string; token: Token | null; excludedToken: Token | null;
  amount: string; onTokenSelect: (t: Token) => void; onAmountChange: (v: string) => void;
  amountDisabled?: boolean; tokenSelectorDisabled?: boolean;
  hasError?: boolean; subLabel?: string;
}
function TokenPanel({ label, token, excludedToken, amount, onTokenSelect, onAmountChange,
  amountDisabled, tokenSelectorDisabled, hasError, subLabel }: TokenPanelProps) {
  return (
    <div className={['rounded-2xl border p-4 transition-all duration-150',
      hasError ? 'border-nq-error/40 bg-nq-error/5' : 'border-nq-border bg-nq-bg/60 hover:border-nq-border/80',
    ].join(' ')}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-nq-muted text-xs font-medium uppercase tracking-wider">{label}</span>
        {subLabel && <span className="text-nq-muted text-xs">{subLabel}</span>}
      </div>
      <div className="flex items-center gap-2">
        <TokenSelector selected={token} excluded={excludedToken} onSelect={onTokenSelect}
          side={label.toLowerCase() as 'from' | 'to'} disabled={tokenSelectorDisabled} />
        <AmountInput value={amount} onChange={onAmountChange} disabled={amountDisabled}
          hasError={hasError} label={`${label} amount`} />
      </div>
    </div>
  );
}

const MOCK_RATES: Record<string, Record<string, number>> = {
  ETH:  { USDC: 3420,    DAI: 3418,   WBTC: 0.0521,    MATIC: 3800    },
  USDC: { ETH: 0.000292, DAI: 0.9998, WBTC: 0.0000152, MATIC: 1.11    },
  DAI:  { ETH: 0.000293, USDC: 1.0002,WBTC: 0.0000153, MATIC: 1.11    },
  WBTC: { ETH: 19.2,     USDC: 65800, DAI: 65780,       MATIC: 73000   },
  MATIC:{ ETH: 0.000263, USDC: 0.901, DAI: 0.9,         WBTC: 0.0000137},
};

function getEstimatedOut(from: Token | null, to: Token | null, amt: string): string {
  if (!from || !to || !amt || parseFloat(amt) === 0) return '';
  const rate = MOCK_RATES[from.symbol]?.[to.symbol];
  if (!rate) return '';
  const out = parseFloat(amt) * rate;
  if (isNaN(out)) return '';
  return out >= 1 ? out.toLocaleString(undefined, { maximumFractionDigits: 4 }) : out.toFixed(6);
}

interface PriceInfoProps { tokenFrom: Token | null; tokenTo: Token | null; amountFrom: string; }
function PriceInfo({ tokenFrom, tokenTo, amountFrom }: PriceInfoProps) {
  if (!tokenFrom || !tokenTo || !amountFrom || parseFloat(amountFrom) === 0) return null;
  const rate = MOCK_RATES[tokenFrom.symbol]?.[tokenTo.symbol];
  if (!rate) return null;
  const amountOut = parseFloat(amountFrom) * rate;
  if (isNaN(amountOut)) return null;
  const impact = Math.min(parseFloat(amountFrom) * 0.001, 0.3).toFixed(2);
  return (
    <div className="rounded-xl border border-nq-border/50 bg-nq-bg/40 px-4 py-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-nq-muted">Rate</span>
        <span className="text-nq-text font-mono">1 {tokenFrom.symbol} = {rate >= 1 ? rate.toLocaleString() : rate.toFixed(6)} {tokenTo.symbol}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-nq-muted">You receive</span>
        <span className="text-nq-text font-mono font-medium">
          ~{amountOut >= 1 ? amountOut.toLocaleString(undefined, { maximumFractionDigits: 4 }) : amountOut.toFixed(6)} {tokenTo.symbol}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-nq-muted">Price impact</span>
        <span className={parseFloat(impact) > 0.1 ? 'text-nq-warning' : 'text-nq-success'}>&lt;{impact}%</span>
      </div>
    </div>
  );
}

function deriveButtonState(p: {
  isConnected: boolean;
  tokenFrom: Token | null;
  tokenTo: Token | null;
  amountFrom: string;
  machineStatus: string;
  canRetry: boolean;
  errorMessage?: string;
}): SwapButtonState {
  switch (p.machineStatus) {
    case 'Simulating':           return 'simulating';
    case 'AwaitingApproval':     return 'awaiting_approval';
    case 'AwaitingConfirmation': return 'awaiting_confirmation';
    case 'Success':              return 'success';
    case 'Failed': {
      const isNetworkError =
        (p.errorMessage ?? '').toLowerCase().includes('network unreachable') ||
        (p.errorMessage ?? '').toLowerCase().includes('rpc');
      return isNetworkError ? 'network_error' : 'failed';
    }
  }
  if (!p.isConnected)                                  return 'connect';
  if (!p.tokenFrom || !p.tokenTo)                      return 'select_tokens';
  if (!p.amountFrom || parseFloat(p.amountFrom) === 0) return 'enter_amount';
  return 'ready';
}

// Main SwapWidget

export function SwapWidget() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const blockTime = useBlockTime();
  const toast = useToast();
  const { state, dispatch, canRetry, isBusy } = useTransactionStateMachine();

  //  stateRef: always holds the latest state so swapExecutor never
  // closes over a stale value. This is the fix for the illegal transition
  // bug — without this, state.status inside useCallback is frozen at the
  // value it had when the callback was last created.

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const [tokenFrom, setTokenFrom] = useState<Token | null>(null);
  const [tokenTo, setTokenTo]     = useState<Token | null>(null);
  const [amountFrom, setAmountFrom] = useState('');
  const [slippage, setSlippage]   = useState(DEFAULT_SLIPPAGE);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Transaction recovery
  const { isRecovering, recoveredTransaction, dismissRecovery } =
    useTransactionRecovery({ dispatch });

  // Auto-reset after success 
  useEffect(() => {
    if (state.status !== 'Success') return;
    const timer = setTimeout(() => dispatch({ type: 'RESET' }), 5_000);
    return () => clearTimeout(timer);
  }, [state.status, dispatch]);

  //  Clear storage after success or terminal failure 
  useEffect(() => {
    if (state.status === 'Success' && state.hash) {
      void clearPendingTransaction(state.hash);
    }
    if (state.status === 'Failed' && state.hash) {
      void clearPendingTransaction(state.hash);
    }
  }, [state]);

  // Swap positions
  const handleSwapPositions = useCallback(() => {
    setTokenFrom(tokenTo);
    setTokenTo(tokenFrom);
    setAmountFrom('');
  }, [tokenFrom, tokenTo]);

  // Swap executor — passed to useDeduplicatedSwap which calls it when the user clicks "Swap"
  // REASON for stateRef: useCallback deps cannot include `state` directly
  // because that would recreate the executor on every state transition,
  // causing useDeduplicatedSwap to see a new executor reference mid-flight.
  // Instead we read the live value from stateRef.current at call time.
  const swapExecutor = useCallback(
    async (requestId: string, _dispatch: (action: TransactionAction) => void) => {

      // Read live state from ref — never stale
      const currentStatus = stateRef.current.status;

      // Retry path: reset and wait for React to process it before proceeding with the new swap flow. This allows users to recover from a failed swap without manually refreshing the page or clicking multiple times.
      if (currentStatus === 'Failed' && canRetry) {
        _dispatch({ type: 'RESET' });
        // Wait 150ms — enough for React to flush the RESET and update stateRef
        await new Promise((r) => setTimeout(r, 150));
      }

      // Re-read after potential reset
      const statusAfterReset = stateRef.current.status;

      // Guard: if we're not in a startable state, bail silently
      if (statusAfterReset !== 'Idle') return;

      //  Step 1: Simulate via Wagmi public client
      // Uses the pre-configured Wagmi transport (your .env RPC keys).
      // A successful getBlockNumber() proves the network is reachable
      // before we ask the user to sign anything.
      _dispatch({ type: 'SIMULATE' });
      try {
        const { getPublicClient } = await import('@wagmi/core');
        const client = getPublicClient(wagmiConfig, { chainId });
        if (!client) throw new Error('No public client for chain');
        await client.getBlockNumber();
        _dispatch({ type: 'SIMULATE_SUCCESS' });
      } catch (err) {
        const rpcErr = new Error(
          `Network unreachable: all RPC endpoints failed for chain ${chainId}.`
        );
        toast.error(
          'Network Error — Retry',
          'Could not reach the network. Check your RPC configuration or connection.',
          0 // persistent — user must dismiss
        );
        _dispatch({ type: 'SIMULATE_FAIL', error: rpcErr });
        return; // handled — do not rethrow
      }

      // Step 2: Request wallet approval
      _dispatch({ type: 'REQUEST_APPROVAL', requestId });
      await new Promise((r) => setTimeout(r, 2000));

      // Step 3: Tx submitted  
      // in a real implementation, this is where you'd send the transaction via your chosen method (e.g. ethers.js, web3.js, or a smart contract wallet SDK). For this mock, we'll just generate a random hash and simulate a successful submission.
      const mockHash = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}` as `0x${string}`;

      _dispatch({ type: 'TRANSACTION_SUBMITTED', hash: mockHash });

      await savePendingTransaction({
        hash: mockHash,
        timestamp: Date.now(),
        chainId,
        tokenIn:  tokenFrom?.symbol ?? 'Unknown',
        tokenOut: tokenTo?.symbol   ?? 'Unknown',
        amountIn: amountFrom,
        status:   'pending',
        expiresAt: Date.now() + TX_TTL_MS,
      });

      //  Step 4: Await confirmation 
      await new Promise((r) => setTimeout(r, 3000));
      _dispatch({
        type: 'TRANSACTION_CONFIRMED',
        receipt: {
          transactionHash: mockHash,
          blockNumber: BigInt(19_500_000),
          blockHash: `0x${'a'.repeat(64)}` as `0x${string}`,
          status: 'success',
          from: '0x0000000000000000000000000000000000000000',
          to:   '0x0000000000000000000000000000000000000000',
          contractAddress: null,
          cumulativeGasUsed: BigInt(21_000),
          effectiveGasPrice: BigInt(1_000_000_000),
          gasUsed: BigInt(21_000),
          logs: [],
          logsBloom: `0x${'0'.repeat(512)}` as `0x${string}`,
          transactionIndex: 0,
          type: 'eip1559',
        },
      });

      toast.success(
        'Swap confirmed',
        `${amountFrom} ${tokenFrom?.symbol ?? ''} → ${tokenTo?.symbol ?? ''}`
      );
    },
    // REASON: state.status intentionally excluded — read via stateRef instead.
    // Including it would cause executor to be recreated on every state change,
    // breaking the deduplication lock mid-flight.
    [canRetry, chainId, tokenFrom, tokenTo, amountFrom, toast]
  );

  const { submitSwap, isLocked, currentRequestId } = useDeduplicatedSwap({
    dispatch,
    executor: swapExecutor,
  });

  // Derived values and memoized callbacks
  const buttonState = deriveButtonState({
    isConnected,
    tokenFrom,
    tokenTo,
    amountFrom,
    machineStatus: state.status,
    canRetry,
    errorMessage: state.status === 'Failed' ? state.error.message : undefined,
  });

  const estimatedOut  = getEstimatedOut(tokenFrom, tokenTo, amountFrom);
  const showPriceInfo = state.status === 'Idle' && !!tokenFrom && !!tokenTo && !!amountFrom && parseFloat(amountFrom) > 0;
  const inputsLocked  = isBusy || state.status === 'Success' || isLocked;

  return (
    <div className="w-full">

      <RecoveryBanner
        isRecovering={isRecovering}
        transaction={recoveredTransaction}
        onDismiss={dismissRecovery}
      />

      <div className="rounded-3xl border border-nq-border bg-nq-surface shadow-2xl shadow-black/40 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-nq-text font-semibold text-lg tracking-tight">Swap</h1>
            <AnimatePresence mode="wait">
              {state.status !== 'Idle' && (
                <motion.span key={state.status}
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.15 }}
                  className={['text-xs font-medium px-2 py-0.5 rounded-full border',
                    state.status === 'Success' ? 'text-nq-success border-nq-success/30 bg-nq-success/10'
                    : state.status === 'Failed' ? 'text-nq-error border-nq-error/30 bg-nq-error/10'
                    : 'text-nq-accent-light border-nq-accent/30 bg-nq-accent/10',
                  ].join(' ')}>
                  {state.status === 'AwaitingApproval'     && 'Confirm in wallet'}
                  {state.status === 'AwaitingConfirmation' && 'On-chain…'}
                  {state.status === 'Simulating'           && 'Simulating…'}
                  {state.status === 'Success'              && '✓ Success'}
                  {state.status === 'Failed'               && '✗ Failed'}
                </motion.span>
              )}
            </AnimatePresence>
            {import.meta.env.DEV && isLocked && currentRequestId && (
              <span title={`Request ID: ${currentRequestId}`}
                className="text-[10px] font-mono text-nq-warning border border-nq-warning/30 bg-nq-warning/10 px-1.5 py-0.5 rounded-full">
                🔒 {currentRequestId.slice(0, 8)}
              </span>
            )}
          </div>
          <button onClick={() => setSettingsOpen((s) => !s)} disabled={isBusy}
            aria-label={`Settings — slippage tolerance ${slippage}%`} aria-expanded={settingsOpen}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-nq-border text-nq-muted text-xs hover:text-nq-text hover:border-nq-border/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.25"/>
              <path d="M6.5 4V6.5L8 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
            </svg>
            {slippage}% slippage
          </button>
        </div>

        {/* Settings panel */}
        <AnimatePresence>
          {settingsOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden">
              <div className="mx-5 mb-3 px-4 py-3 rounded-2xl border border-nq-border bg-nq-bg/60">
                <SlippageRow value={slippage} onChange={setSlippage} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Token panels */}
        <div className="px-4 pb-4 space-y-1">
          <TokenPanel label="From" token={tokenFrom} excludedToken={tokenTo} amount={amountFrom}
            onTokenSelect={setTokenFrom} onAmountChange={setAmountFrom}
            tokenSelectorDisabled={inputsLocked} amountDisabled={inputsLocked} />

          <SwapArrow onClick={handleSwapPositions} disabled={inputsLocked || (!tokenFrom && !tokenTo)} />

          <TokenPanel label="To" token={tokenTo} excludedToken={tokenFrom} amount={estimatedOut}
            onTokenSelect={setTokenTo} onAmountChange={() => {}} amountDisabled
            tokenSelectorDisabled={inputsLocked} subLabel="Estimated" />

          <AnimatePresence>
            {showPriceInfo && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="pt-1">
                <PriceInfo tokenFrom={tokenFrom} tokenTo={tokenTo} amountFrom={amountFrom} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pending animation panel */}
          <AnimatePresence>
            {isBusy && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex flex-col items-center justify-center py-4 gap-3"
              >
                <NQLogoPendingAnimation
                  animationDuration={blockTime}
                  isActive={isBusy}
                  size={72}
                  color="#a78bfa"
                />
                <p className="text-nq-muted text-xs font-medium tracking-wide">
                  {state.status === 'Simulating'           && 'Simulating transaction…'}
                  {state.status === 'AwaitingApproval'     && 'Waiting for wallet approval…'}
                  {state.status === 'AwaitingConfirmation' && 'Waiting for on-chain confirmation…'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success receipt */}
          <AnimatePresence>
            {state.status === 'Success' && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }}
                className="rounded-xl border border-nq-success/30 bg-nq-success/5 px-4 py-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-nq-success font-medium">Transaction confirmed</span>
                  <a href={`https://etherscan.io/tx/${state.hash}`} target="_blank"
                    rel="noopener noreferrer" className="text-nq-accent-light hover:underline font-mono">
                    {state.hash.slice(0, 6)}…{state.hash.slice(-4)} ↗
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error detail */}
          <AnimatePresence>
            {state.status === 'Failed' && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.2 }}
                className="rounded-xl border border-nq-error/30 bg-nq-error/5 px-4 py-3 text-xs">
                <p className="text-nq-error font-medium mb-0.5">Transaction failed</p>
                <p className="text-nq-muted">{state.error.message}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          <div className="pt-2">
            {buttonState === 'connect' ? (
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <SwapButton buttonState="connect" onClick={show} animationDuration={blockTime} />
                )}
              </ConnectKitButton.Custom>
            ) : (
              <SwapButton buttonState={buttonState} onClick={submitSwap} animationDuration={blockTime} />
            )}
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />

      {/* Status footer */}
      {isConnected && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center justify-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-nq-success animate-pulse" />
            <span className="text-nq-muted text-xs">Connected</span>
          </span>
          {isLocked && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-nq-warning animate-pulse" />
              <span className="text-nq-muted text-xs">Swap in progress</span>
            </span>
          )}
        </motion.div>
      )}
    </div>
  );
}
