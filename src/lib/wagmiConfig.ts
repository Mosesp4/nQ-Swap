/**
 * Wagmi v2 configuration supporting 5 EVM chains.
 * Each chain is configured with 3 RPC endpoints from environment variables
 * to enable fallback behavior in rpcFallback.ts.
 *
 * REASON: We use http() transports with explicit URLs rather than relying on
 * Wagmi's default public RPCs — public RPCs are rate-limited and unreliable
 * for production use. Environment variables keep secrets out of the bundle.
 */

import { http, createConfig, fallback } from 'wagmi';
import {
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
} from 'wagmi/chains';
import { getDefaultConfig } from 'connectkit';

// Validate required environment variables at startup.
// In development, missing vars produce a clear error rather than silent failure.
function requireEnv(key: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (!value || value === '') {
    // In production builds we want a graceful fallback, not a crash.
    // In development, we surface the missing variable clearly.
    if (import.meta.env.DEV) {
      console.warn(
        `[wagmiConfig] Missing environment variable: ${key}. ` +
          `Copy .env.example to .env and fill in your values.`
      );
    }
    return '';
  }
  return value;
}

// RPC endpoint sets — 3 per chain, used by both Wagmi transport and
// the rpcFallback utility for manual fetch-level retries.
export const RPC_ENDPOINTS: Record<number, [string, string, string]> = {
  1: [
    requireEnv('VITE_RPC_ETHEREUM_1'),
    requireEnv('VITE_RPC_ETHEREUM_2'),
    requireEnv('VITE_RPC_ETHEREUM_3'),
  ],
  137: [
    requireEnv('VITE_RPC_POLYGON_1'),
    requireEnv('VITE_RPC_POLYGON_2'),
    requireEnv('VITE_RPC_POLYGON_3'),
  ],
  42161: [
    requireEnv('VITE_RPC_ARBITRUM_1'),
    requireEnv('VITE_RPC_ARBITRUM_2'),
    requireEnv('VITE_RPC_ARBITRUM_3'),
  ],
  10: [
    requireEnv('VITE_RPC_OPTIMISM_1'),
    requireEnv('VITE_RPC_OPTIMISM_2'),
    requireEnv('VITE_RPC_OPTIMISM_3'),
  ],
  8453: [
    requireEnv('VITE_RPC_BASE_1'),
    requireEnv('VITE_RPC_BASE_2'),
    requireEnv('VITE_RPC_BASE_3'),
  ],
};

/**
 * I Built a Wagmi transport with automatic fallback across 3 RPC endpoints.
 * Wagmi's built-in `fallback()` transport tries each http() in order.
 *
 * REASON: Using Wagmi's fallback transport ensures that at the Wagmi layer,
 * failed reads automatically retry against the next RPC without any custom
 * code. Our rpcFallback.ts handles the fetch-level fallback for non-Wagmi
 * calls and provides exponential backoff.
 */
function buildTransport(chainId: number) {
  const endpoints = RPC_ENDPOINTS[chainId];
  if (!endpoints) throw new Error(`No RPC endpoints configured for chain ${chainId}`);

  const [primary, secondary, tertiary] = endpoints;

  // Filter out empty strings (missing env vars) and fall back to public nodes
  const publicFallbacks: Record<number, string> = {
    1: 'https://cloudflare-eth.com',
    137: 'https://polygon-rpc.com',
    42161: 'https://arb1.arbitrum.io/rpc',
    10: 'https://mainnet.optimism.io',
    8453: 'https://mainnet.base.org',
  };

  const urls = [primary, secondary, tertiary]
    .filter(Boolean)
    .concat(publicFallbacks[chainId] ?? []);

  if (urls.length === 0) {
    throw new Error(`No valid RPC URLs for chain ${chainId}`);
  }

  return fallback(urls.map((url) => http(url)));
}

// ConnectKit / Wagmi config
// getDefaultConfig wires up WalletConnect, injected wallets, and Wagmi
// with a single call, while still allowing us to override transports.
export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [mainnet, polygon, arbitrum, optimism, base],
    transports: {
      [mainnet.id]: buildTransport(mainnet.id),
      [polygon.id]: buildTransport(polygon.id),
      [arbitrum.id]: buildTransport(arbitrum.id),
      [optimism.id]: buildTransport(optimism.id),
      [base.id]: buildTransport(base.id),
    },
    walletConnectProjectId:
      (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string) ?? '',
    appName: 'nQ Swap',
    appDescription: 'Production-grade DeFi swap widget',
    appUrl: 'https://nq-swap.com',
    appIcon: '/nq-icon.svg',
  })
);
