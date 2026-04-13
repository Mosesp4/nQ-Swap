/**
 * Shared transaction-related types used across hooks and components.
 * Importing from viem keeps us aligned with Wagmi's internal types.
 */

import type { TransactionReceipt } from 'viem';
export type { TransactionReceipt };

// Transaction State Machine types
export type TransactionStatus =
  | 'Idle'
  | 'Simulating'
  | 'AwaitingApproval'
  | 'AwaitingConfirmation'
  | 'Success'
  | 'Failed';

export type TransactionState =
  | { status: 'Idle' }
  | { status: 'Simulating' }
  | { status: 'AwaitingApproval'; requestId: string }
  | { status: 'AwaitingConfirmation'; hash: `0x${string}`; submittedAt: number }
  | { status: 'Success'; hash: `0x${string}`; receipt: TransactionReceipt }
  | {
      status: 'Failed';
      hash?: `0x${string}`;
      error: Error;
      isRetryable: boolean;
    };

export type TransactionAction =
  | { type: 'SIMULATE' }
  | { type: 'SIMULATE_SUCCESS' }
  | { type: 'SIMULATE_FAIL'; error: Error }
  | { type: 'REQUEST_APPROVAL'; requestId: string }
  | { type: 'APPROVAL_REJECTED' }
  | { type: 'TRANSACTION_SUBMITTED'; hash: `0x${string}` }
  | { type: 'TRANSACTION_CONFIRMED'; receipt: TransactionReceipt }
  | { type: 'TRANSACTION_FAILED'; error: Error }
  | { type: 'RESET' };

// Token types
export interface Token {
  symbol: string;
  name: string;
  decimals: number;
  address: `0x${string}` | 'native';
  chainId: number;
  logoColor: string; 
}
