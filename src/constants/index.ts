/**
 * Application-wide constants. Single source of truth for magic numbers
 * and configuration values that appear in multiple places.
 */

import type { Token } from '@/types/transaction';


// Timing

// Maximum time a deduplication lock can be held before auto-release (ms)
export const DEDUP_LOCK_TIMEOUT_MS = 60_000;

// Time to wait before clearing confirmed transaction from storage (ms)
export const TX_CLEAR_DELAY_MS = 5_000;

//Pending transaction TTL — 30 minutes (ms)
export const TX_TTL_MS = 30 * 60 * 1_000;

// Slippage

export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0] as const;
export type SlippagePreset = (typeof SLIPPAGE_PRESETS)[number];
export const DEFAULT_SLIPPAGE = 0.5;

// Supported tokens 
export const SUPPORTED_TOKENS: Token[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    address: 'native',
    chainId: 1,
    logoColor: '#627EEA',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chainId: 1,
    logoColor: '#2775CA',
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    chainId: 1,
    logoColor: '#F5AC37',
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    chainId: 1,
    logoColor: '#F7931A',
  },
  {
    symbol: 'MATIC',
    name: 'Polygon',
    decimals: 18,
    address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
    chainId: 1,
    logoColor: '#8247E5',
  },
];

// Chain display names
export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  8453: 'Base',
};

// Explorer URLs
export const EXPLORER_URLS: Record<number, string> = {
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  8453: 'https://basescan.org',
};

export function getExplorerTxUrl(chainId: number, hash: string): string {
  const base = EXPLORER_URLS[chainId] ?? 'https://etherscan.io';
  return `${base}/tx/${hash}`;
}
