import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';

/**
 * Query cache and paused mutations live in IndexedDB so marks queued while offline survive a
 * reload. Falls back to an in-memory shim where IndexedDB is unavailable (private mode quirks).
 */
export function createPersister() {
  const memory = new Map<string, string>();
  const safe = <T>(fn: () => Promise<T>, fallback: () => T): Promise<T> => fn().catch(fallback);
  return createAsyncStoragePersister({
    key: 'parade-state-cache',
    throttleTime: 500,
    storage: {
      getItem: (key) => safe(() => get<string>(key).then((v) => v ?? null), () => memory.get(key) ?? null),
      setItem: (key, value) => safe(() => set(key, value), () => { memory.set(key, value); }),
      removeItem: (key) => safe(() => del(key), () => { memory.delete(key); }),
    },
  });
}

/** Bump when persisted shapes change so stale caches are discarded. */
export const PERSIST_BUSTER = 'v1';
