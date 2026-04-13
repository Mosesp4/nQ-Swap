/**
 * rpcFallback.ts
 *
 * Fetch-level RPC fallback with exponential backoff. Used for any JSON-RPC
 * call that happens outside of Wagmi's built-in transport (e.g. custom
 * simulation calls, price fetches, or manual eth_call invocations).
 *
 * DESIGN DECISIONS:
 *
 * 1. THREE ENDPOINTS PER CHAIN
 *    Primary → fallback 1 → fallback 2. Each endpoint gets up to MAX_RETRIES
 *    attempts with exponential backoff before we move to the next one.
 *    This means a total of 3 × 3 = 9 attempts before RPCExhaustedError.
 *
 * 2. EXPONENTIAL BACKOFF: 100ms → 200ms → 400ms
 *    REASON: Immediate retries on a failing RPC just pile more load onto an
 *    already struggling node. Exponential backoff gives the node time to
 *    recover and avoids thundering-herd amplification.
 *
 * 3. TYPED RPCExhaustedError
 *    REASON: Callers need to distinguish "all RPCs failed" from "the call
 *    succeeded but returned an error". RPCExhaustedError carries chainId and
 *    attempt count so error boundaries can show chain-specific messaging.
 *
 * 4. STRUCTURED FAILURE LOGGING
 *    Every failure logs: timestamp, chainId, endpoint URL (redacted to origin
 *    only in production to avoid leaking API keys), error type, retry count.
 *
 * 5. ABORT SIGNAL SUPPORT
 *    Each fetch is wired to an AbortController. If the caller unmounts or
 *    cancels, all in-flight retries are cancelled immediately.
 */

import { RPC_ENDPOINTS } from '@/lib/wagmiConfig';

export class RPCExhaustedError extends Error {
  public readonly chainId: number;
  public readonly attempts: number;

  constructor(chainId: number, attempts: number) {
    super(
      `All RPC endpoints exhausted for chain ${chainId} after ${attempts} attempts`
    );
    this.name = 'RPCExhaustedError';
    this.chainId = chainId;
    this.attempts = attempts;
  }
}

export class RPCResponseError extends Error {
  public readonly code: number;
  public readonly endpoint: string;

  constructor(message: string, code: number, endpoint: string) {
    super(message);
    this.name = 'RPCResponseError';
    this.code = code;
    this.endpoint = endpoint;
  }
}


// Simulation-specific error types
export type SimulationErrorKind =
  | 'insufficient_balance'
  | 'insufficient_allowance'
  | 'slippage_exceeded'
  | 'unknown';

export class SimulationError extends Error {
  public readonly kind: SimulationErrorKind;

  constructor(kind: SimulationErrorKind, message: string) {
    super(message);
    this.name = 'SimulationError';
    this.kind = kind;
  }
}

export const SIMULATION_ERROR_MESSAGES: Record<SimulationErrorKind, string> = {
  insufficient_balance:   'Insufficient balance to complete this swap.',
  insufficient_allowance: 'Token allowance too low. You need to approve this token first.',
  slippage_exceeded:      'Price moved beyond your slippage tolerance. Try increasing it.',
  unknown:                'Simulation failed. The transaction would likely revert on-chain.',
};

// Constants
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100; // 100 → 200 → 400ms

// Internal helpers
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return '[invalid url]';
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function fetchRPC(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new RPCResponseError(`HTTP ${response.status} from RPC`, response.status, url);
  }

  const json = await response.json() as {
    result?: unknown;
    error?: { code: number; message: string };
  };

  if (json.error) {
    throw new RPCResponseError(json.error.message, json.error.code, url);
  }

  return json.result;
}

// Public API
interface FetchWithFallbackOptions {
  signal?: AbortSignal;
}

export async function fetchWithFallback(
  chainId: number,
  body: unknown,
  options: FetchWithFallbackOptions = {}
): Promise<unknown> {
  const endpoints = RPC_ENDPOINTS[chainId];
  if (!endpoints) {
    throw new RPCExhaustedError(chainId, 0);
  }

  const PUBLIC_FALLBACKS: Record<number, string> = {
    1:     'https://cloudflare-eth.com',
    137:   'https://polygon-rpc.com',
    42161: 'https://arb1.arbitrum.io/rpc',
    10:    'https://mainnet.optimism.io',
    8453:  'https://mainnet.base.org',
  };

  const validEndpoints = [
    ...endpoints.filter(Boolean),
    PUBLIC_FALLBACKS[chainId],
  ].filter((url): url is string => !!url);

  let totalAttempts = 0;
  const errors: Error[] = [];

  for (const endpoint of validEndpoints) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      totalAttempts++;

      if (attempt > 0) {
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        if (import.meta.env.DEV) {
          console.log(
            `[rpcFallback] Retrying in ${backoffMs}ms — ` +
            `endpoint: ${redactUrl(endpoint)}, attempt: ${attempt + 1}/${MAX_RETRIES}`
          );
        }
        await sleep(backoffMs, options.signal);
      }

      try {
        const result = await fetchRPC(endpoint, body, options.signal);

        if (import.meta.env.DEV && (attempt > 0 || errors.length > 0)) {
          console.log(
            `%c[rpcFallback] Succeeded after ${totalAttempts} total attempts`,
            'color: #10b981',
            { chainId, endpoint: redactUrl(endpoint) }
          );
        }

        return result;

      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;

        const error = err instanceof Error ? err : new Error(String(err));
        errors.push(error);

        if (import.meta.env.DEV) {
          console.warn(
            `%c[rpcFallback] Attempt ${totalAttempts} failed`,
            'color: #f59e0b',
            {
              chainId,
              endpoint: redactUrl(endpoint),
              attempt: attempt + 1,
              error: error.message,
              timestamp: new Date().toISOString(),
            }
          );
        }
      }
    }

    if (import.meta.env.DEV) {
      console.warn(
        `%c[rpcFallback] Endpoint exhausted, trying next`,
        'color: #ef4444',
        { chainId, endpoint: redactUrl(endpoint) }
      );
    }
  }

  throw new RPCExhaustedError(chainId, totalAttempts);
}

// Simulation error classifier
export function classifySimulationError(err: unknown): SimulationError {
  const message = err instanceof Error
    ? err.message.toLowerCase()
    : String(err).toLowerCase();

  if (
    message.includes('insufficient funds') ||
    message.includes('insufficient balance') ||
    message.includes('transfer amount exceeds balance')
  ) {
    return new SimulationError('insufficient_balance', SIMULATION_ERROR_MESSAGES.insufficient_balance);
  }

  if (
    message.includes('allowance') ||
    message.includes('approve') ||
    message.includes('exceeds allowance') ||
    message.includes('transfer amount exceeds allowance')
  ) {
    return new SimulationError('insufficient_allowance', SIMULATION_ERROR_MESSAGES.insufficient_allowance);
  }

  if (
    message.includes('slippage') ||
    message.includes('price impact') ||
    message.includes('too little received') ||
    message.includes('insufficient output amount') ||
    message.includes('expired')
  ) {
    return new SimulationError('slippage_exceeded', SIMULATION_ERROR_MESSAGES.slippage_exceeded);
  }

  return new SimulationError('unknown', SIMULATION_ERROR_MESSAGES.unknown);
}