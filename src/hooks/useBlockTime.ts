/**
 * Returns the average block time in seconds for the currently connected chain.
 * Used by NQLogoPendingAnimation to sync its loop speed to real blockchain cadence.
 *
 * REASON: A 12-second animation loop on Ethereum feels appropriately slow and
 * weighty — each loop represents roughly one block. On Arbitrum (0.25s blocks)
 * the same loop would feel broken. Chain-aware timing makes the animation
 * genuinely informative, not just decorative.
 */

import { useChainId } from 'wagmi';

export const BLOCK_TIMES: Record<number, number> = {
  1:     12,    // Ethereum Mainnet — ~12s
  137:   2,     // Polygon          — ~2s
  42161: 0.25,  // Arbitrum One     — ~250ms
  10:    2,     // Optimism         — ~2s
  8453:  2,     // Base             — ~2s
};

/**
 * Returns block time in seconds for the current chain.
 * Falls back to Ethereum's 12s if the chain is unrecognised.
 */
export function useBlockTime(): number {
  const chainId = useChainId();
  return BLOCK_TIMES[chainId] ?? 12;
}
