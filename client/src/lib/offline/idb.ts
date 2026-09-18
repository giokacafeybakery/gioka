/**
 * Minimal IndexedDB wrapper (no dependencies). Four stores:
 *  - cache:  last successful GET responses, keyed by URL           → the app can render everything without network
 *  - outbox: operations done while offline, keyed by op id          → replayed in order when the connection is back
 *  - vault:  per-email local password verifier + last session token → log in / open the register without network
 *  - meta:   small key/value settings
 * Falls back to an in-memory Map when IndexedDB is unavailable (private mode, very old browsers), so the app still works
 * for the current session even if nothing can be persisted.
 */
export type Store = "cache" | "outbox" | "vault" | "meta";

const NAME = "gioka-offline";
const VERSION = 1;
const STORES: Store[] = ["cache", "outbox", "vault", "meta"];

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory: Record<Store, Map<string, unknown>> = { cache: new Map(), outbox: new Map(), vault: new Map(), meta: new Map() };

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => { const db = req.result; for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); };
      req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest<T>[]): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      const last = Array.isArray(r) ? r[r.length - 1] : r;
      t.oncomplete = () => resolve(last ? last.result : undefined);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export const idb = {
  async get<T>(store: Store, key: string): Promise<T | undefined> {
    if (memory[store].has(key)) return memory[store].get(key) as T;
    return tx<T>(store, "readonly", (s) => s.get(key));
  },
  async put(store: Store, key: string, value: unknown): Promise<void> {
    const db = await open();
    if (!db) { memory[store].set(key, value); return; }
    await tx(store, "readwrite", (s) => s.put(value, key));
  },
  async del(store: Store, key: string): Promise<void> {
    memory[store].delete(key);
    await tx(store, "readwrite", (s) => s.delete(key));
  },
  async all<T>(store: Store): Promise<T[]> {
    const db = await open();
    if (!db) return [...memory[store].values()] as T[];
    return (await tx<T[]>(store, "readonly", (s) => s.getAll())) || [];
  },
  async keys(store: Store): Promise<string[]> {
    const db = await open();
    if (!db) return [...memory[store].keys()];
    return ((await tx<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys())) || []).map(String);
  },
  async clear(store: Store): Promise<void> {
    memory[store].clear();
    await tx(store, "readwrite", (s) => s.clear());
  },
};
