/**
 * transactionStorage.ts
 *
 * Dual-layer persistence for pending transactions:
 *   Primary:  IndexedDB via `idb` — survives tab close, survives page refresh,
 *             supports structured data, no size constraints for our use case.
 *   Fallback: localStorage — synchronous, always available, used when IndexedDB
 *             is unavailable (private browsing on some browsers, quota exceeded).
 *
 * DESIGN DECISIONS:
 *
 * 1. WHY DUAL LAYER?
 *    IndexedDB can fail in private/incognito mode in Safari and in low-memory
 *    situations. localStorage is synchronous and always available but has a
 *    5MB quota shared across the whole origin. For our narrow use case (one
 *    pending tx at a time, ~300 bytes), localStorage is a perfectly adequate
 *    fallback. We write to both on save so recovery works regardless of which
 *    layer is available on the next page load.
 *
 * 2. WHY NOT JUST localStorage?
 *    localStorage blocks the main thread on every read/write. For a single
 *    small record this is imperceptible, but IndexedDB is the correct
 *    primitive for structured browser persistence. We use localStorage only
 *    as a synchronous fallback and emergency read path.
 *
 * 3. 30-MINUTE TTL
 *    EVM transactions that are not mined within ~30 minutes are almost
 *    certainly stuck or dropped. Showing a recovery banner for a 2-hour-old
 *    pending tx would confuse users. We discard expired records silently on
 *    read so they never surface to the UI.
 *
 * 4. STORAGE QUOTA ERROR HANDLING
 *    QuotaExceededError is caught and handled non-blockingly — the swap flow
 *    continues even if persistence fails. The user just won't get the recovery
 *    banner if they close the tab. This is better than crashing the widget.
 *
 * 5. SINGLETON DB PROMISE
 *    We open the IndexedDB connection once and reuse the promise. Opening a
 *    new connection on every read/write is wasteful and can cause version
 *    conflicts. The singleton is safe because idb's openDB is idempotent for
 *    the same name+version.
 */

import { openDB, type IDBPDatabase } from 'idb';

// Types
export interface PendingTransaction {
  hash: `0x${string}`;
  timestamp: number;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  status: 'pending' | 'confirmed' | 'failed';
  expiresAt: number; // timestamp + TX_TTL_MS (30 minutes)
}

// IndexedDB schema
interface NQSwapDB {
  'pending-transactions': {
    key: string; // tx hash
    value: PendingTransaction;
  };
}

const DB_NAME    = 'nq-swap-widget';
const DB_VERSION = 1;
const STORE_NAME = 'pending-transactions' as const;
const LS_KEY     = 'nq-swap:pending-tx';

// Singleton DB connection
let dbPromise: Promise<IDBPDatabase<NQSwapDB>> | null = null;

function getDB(): Promise<IDBPDatabase<NQSwapDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NQSwapDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
      blocked() {
        // Another tab has an older version open.
        // We log and continue — the operation will retry on next open.
        console.warn('[transactionStorage] IndexedDB upgrade blocked by another tab');
      },
      terminated() {
        // Browser killed the connection (e.g. low memory).
        // Reset the singleton so next call re-opens.
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

// localStorage helpers (fallback + synchronous backup)
function lsWrite(tx: PendingTransaction): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tx));
  } catch (err) {
    // QuotaExceededError — non-blocking, log and continue
    if (import.meta.env.DEV) {
      console.warn('[transactionStorage] localStorage write failed:', err);
    }
  }
}

function lsRead(): PendingTransaction | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingTransaction;
  } catch {
    return null;
  }
}

function lsClear(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
  }
}

// TTL check — reusable across both storage layers

function isExpired(tx: PendingTransaction): boolean {
  return Date.now() > tx.expiresAt;
}

// Public API

/**
 * Persist a pending transaction to both IndexedDB and localStorage.
 * Non-blocking — failures are logged but do not throw.
 */
export async function savePendingTransaction(tx: PendingTransaction): Promise<void> {
  // Always write to localStorage first — it's synchronous and immediate.
  // This way, if the page reloads before the IndexedDB write completes,
  // the fallback read path still has the data.
  lsWrite(tx);

  try {
    const db = await getDB();
    await db.put(STORE_NAME, tx, tx.hash);
  } catch (err) {
    // IndexedDB failed (quota, private browsing, etc.) — localStorage has it.
    if (import.meta.env.DEV) {
      console.warn('[transactionStorage] IndexedDB write failed, localStorage fallback active:', err);
    }
  }
}

/**
 * Read a pending transaction by hash.
 * Returns null if not found, expired, or storage is unavailable.
 * Expired records are silently cleared from both layers.
 */
export async function getPendingTransaction(
  hash: `0x${string}`
): Promise<PendingTransaction | null> {
  let tx: PendingTransaction | null = null;

  // Try IndexedDB first
  try {
    const db = await getDB();
    tx = (await db.get(STORE_NAME, hash)) ?? null;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[transactionStorage] IndexedDB read failed, trying localStorage:', err);
    }
  }

  // Fall back to localStorage if IndexedDB returned nothing
  if (!tx) {
    const lsTx = lsRead();
    // Only use localStorage result if the hash matches what we're looking for
    if (lsTx && lsTx.hash === hash) {
      tx = lsTx;
    }
  }

  if (!tx) return null;

  // TTL check — discard silently if expired
  if (isExpired(tx)) {
    if (import.meta.env.DEV) {
      console.log('[transactionStorage] Discarded expired pending tx:', hash.slice(0, 10));
    }
    await clearPendingTransaction(hash);
    return null;
  }

  return tx;
}

/**
 * Retrieve ANY pending transaction (used on mount when we don't know the hash).
 * Checks localStorage first (synchronous, faster) then IndexedDB.
 * Returns null if nothing found or all found records are expired.
 */
export async function getAnyPendingTransaction(): Promise<PendingTransaction | null> {
  // Check localStorage first (fastest path)
  const lsTx = lsRead();
  if (lsTx) {
    if (isExpired(lsTx)) {
      lsClear();
    } else {
      return lsTx;
    }
  }

  // Scan IndexedDB 
  try {
    const db = await getDB();
    const all = await db.getAll(STORE_NAME);
    for (const tx of all) {
      if (!isExpired(tx)) return tx;
      // Clean up expired records while we're here
      void db.delete(STORE_NAME, tx.hash);
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[transactionStorage] IndexedDB scan failed:', err);
    }
  }

  return null;
}

/**
 * Remove a pending transaction from both storage layers.
 * Safe to call even if the record doesn't exist.
 */
export async function clearPendingTransaction(hash: `0x${string}`): Promise<void> {
  lsClear();
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, hash);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[transactionStorage] IndexedDB delete failed:', err);
    }
  }
}

/**
 * Update the status field of a persisted transaction.
 * Used when a tx transitions from 'pending' → 'confirmed' | 'failed'.
 */
export async function updateTransactionStatus(
  hash: `0x${string}`,
  status: PendingTransaction['status']
): Promise<void> {
  const existing = await getPendingTransaction(hash);
  if (!existing) return;
  await savePendingTransaction({ ...existing, status });
}
