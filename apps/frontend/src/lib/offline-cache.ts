/**
 * IndexedDB offline cache for frequently accessed data.
 *
 * Database: omnitech-offline-v1
 * Stores: wiki, tickets, notifications
 * TTL: 24 hours per entry
 *
 * Uses only the native IndexedDB API (no npm dependency).
 */

const DB_NAME = 'omnitech-offline-v1';
const DB_VERSION = 1;
const STORE_NAMES = ['wiki', 'tickets', 'notifications'] as const;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type StoreName = (typeof STORE_NAMES)[number];

interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  cachedAt: number;
}

/** Global flag: set to true whenever a response is served from IndexedDB. */
let _servingFromCache = false;
const _listeners = new Set<(v: boolean) => void>();

export function isServingFromCache(): boolean {
  return _servingFromCache;
}

export function setServingFromCache(v: boolean): void {
  if (_servingFromCache !== v) {
    _servingFromCache = v;
    _listeners.forEach((fn) => fn(v));
  }
}

export function onCacheStatusChange(fn: (v: boolean) => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'key' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store data in the given IndexedDB store with the provided key.
 * Automatically sets the `cachedAt` timestamp for TTL checks.
 */
export async function cacheData<T>(store: StoreName, key: string, data: T): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    const entry: CacheEntry<T> = { key, data, cachedAt: Date.now() };
    os.put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Silently ignore cache write failures
  }
}

/**
 * Retrieve a cached entry. Returns `null` if the entry does not exist or
 * has exceeded the 24-hour TTL.
 */
export async function getCached<T = unknown>(store: StoreName, key: string): Promise<T | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    const request = os.get(key);

    const entry = await new Promise<CacheEntry<T> | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as CacheEntry<T> | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();

    if (!entry) return null;
    if (Date.now() - entry.cachedAt > TTL_MS) return null;

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Remove all entries from a specific store.
 */
export async function clearStore(store: StoreName): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Silently ignore
  }
}

/**
 * Remove all entries from every store (full cache wipe).
 */
export async function clearAll(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([...STORE_NAMES], 'readwrite');
    for (const name of STORE_NAMES) {
      tx.objectStore(name).clear();
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Silently ignore
  }
}

// ---------------------------------------------------------------------------
// URL-to-store mapping used by the API interceptor
// ---------------------------------------------------------------------------

const ROUTE_STORE_MAP: Array<{ pattern: RegExp; store: StoreName }> = [
  { pattern: /^\/wiki/, store: 'wiki' },
  { pattern: /^\/tickets/, store: 'tickets' },
  { pattern: /^\/notifications/, store: 'notifications' },
];

/**
 * Determine which cache store (if any) a given API path belongs to.
 * Returns null for paths that should not be cached.
 */
export function resolveStore(url: string): StoreName | null {
  for (const { pattern, store } of ROUTE_STORE_MAP) {
    if (pattern.test(url)) return store;
  }
  return null;
}

/**
 * Build a deterministic cache key from a URL path and optional query params.
 */
export function buildCacheKey(url: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return url;
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&');
  return sorted ? `${url}?${sorted}` : url;
}
