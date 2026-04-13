/**
 * Modal-based token picker triggered by clicking the token display pill.
 * Features a live search filter, colored SVG placeholder icons, and
 * duplicate-token prevention (can't select same token on both sides).
 * 
 * REASON: Modal over dropdown — at mobile widths a full-screen modal is far
 * more usable than a dropdown that clips viewport edges. We animate it with
 * Framer Motion for a native-app feel.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SUPPORTED_TOKENS } from '@/constants';
import type { Token } from '@/types/transaction';

interface TokenSelectorProps {
  selected: Token | null;
  excluded: Token | null;
  onSelect: (token: Token) => void;
  side: 'from' | 'to';
  disabled?: boolean;
}

function TokenIcon({ token, size = 28 }: { token: Token; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="14" cy="14" r="14" fill={token.logoColor} fillOpacity="0.15" />
      <circle cx="14" cy="14" r="13" stroke={token.logoColor} strokeWidth="1" strokeOpacity="0.4" />
      <text
        x="14"
        y="14"
        textAnchor="middle"
        dominantBaseline="central"
        fill={token.logoColor}
        fontSize={token.symbol.length > 3 ? '7' : '9'}
        fontFamily="'DM Sans', system-ui, sans-serif"
        fontWeight="600"
        letterSpacing="-0.5"
      >
        {token.symbol.slice(0, 4)}
      </text>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3.5 5.25L7 8.75L10.5 5.25"
        stroke="#64748b"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyTokenPill({ side }: { side: 'from' | 'to' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full border border-dashed border-nq-border flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 2v8M2 6h8" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-nq-muted text-sm font-medium">
        {side === 'from' ? 'Select token' : 'Select token'}
      </span>
      <ChevronIcon />
    </div>
  );
}

export function TokenSelector({
  selected,
  excluded,
  onSelect,
  side,
  disabled = false,
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = SUPPORTED_TOKENS.filter((t) => {
    if (excluded && t.symbol === excluded.symbol) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleSelect = useCallback(
    (token: Token) => {
      onSelect(token);
      setIsOpen(false);
    },
    [onSelect]
  );

  return (
    <>
      <button
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        aria-label={`Select ${side} token${selected ? `, currently ${selected.symbol}` : ''}`}
        className={[
          'flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-150',
          'border border-transparent',
          disabled
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:bg-white/5 hover:border-nq-border cursor-pointer active:scale-95',
        ].join(' ')}
      >
        {selected ? (
          <>
            <TokenIcon token={selected} />
            <span className="text-nq-text font-semibold text-base">{selected.symbol}</span>
            <ChevronIcon />
          </>
        ) : (
          <EmptyTokenPill side={side} />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              aria-hidden="true"
            />

            <motion.div
              key="panel"
              role="dialog"
              aria-modal="true"
              aria-label="Select a token"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={[
                'fixed z-50 left-1/2 -translate-x-1/2',
                'w-[calc(100vw-32px)] max-w-[400px]',
                'top-[30%] -translate-y-1/2',
                'max-h-[min(560px,calc(100dvh-48px))]',
                'bg-nq-surface border border-nq-border rounded-2xl',
                'shadow-2xl shadow-black/50',
                'overflow-hidden flex flex-col',
              ].join(' ')}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-nq-border">
                <h2 className="text-nq-text font-semibold text-base">Select token</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label="Close token selector"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-nq-muted hover:text-nq-text hover:bg-white/5 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M2 2L12 12M12 2L2 12"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="px-4 py-3">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-nq-muted"
                    width="15"
                    height="15"
                    viewBox="0 0 15 15"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path
                      d="M10.5 10.5L13.5 13.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or symbol"
                    className={[
                      'w-full pl-9 pr-4 py-2.5 rounded-xl text-sm',
                      'bg-nq-bg border border-nq-border',
                      'text-nq-text placeholder:text-nq-muted',
                      'focus:border-nq-accent/60 focus:ring-1 focus:ring-nq-accent/30',
                      'transition-all duration-150',
                    ].join(' ')}
                  />
                </div>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 px-2 pb-3">
                {filtered.length === 0 ? (
                  <div className="py-8 text-center text-nq-muted text-sm">
                    No tokens match &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  filtered.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => handleSelect(token)}
                      className={[
                        'w-full flex items-center gap-3 px-3 py-3 rounded-xl',
                        'text-left transition-all duration-100',
                        'hover:bg-white/5 active:bg-white/10',
                        selected?.symbol === token.symbol
                          ? 'bg-nq-accent/10 border border-nq-accent/30'
                          : 'border border-transparent',
                      ].join(' ')}
                    >
                      <TokenIcon token={token} size={36} />
                      <div className="flex-1 min-w-0">
                        <div className="text-nq-text font-semibold text-sm">{token.symbol}</div>
                        <div className="text-nq-muted text-xs truncate">{token.name}</div>
                      </div>
                      {selected?.symbol === token.symbol && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path
                            d="M3 8L6.5 11.5L13 4.5"
                            stroke="#7c3aed"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
