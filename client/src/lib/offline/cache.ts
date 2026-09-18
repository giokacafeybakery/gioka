import { idb } from "./idb";

/**
 * Read cache: the last successful response of every GET, keyed by URL (query string included).
 * Memory first (synchronous reads for the projection layer), IndexedDB behind it (survives reloads / app restarts).
 */
interface Entry { data: unknown; at: number }
const mem = new Map<string, Entry>();
let hydrated: Promise<void> | null = null;

/** Load every cached response into memory (called once at boot; cheap, a few hundred KB at most). */
export function hydrateCache(): Promise<void> {
  if (hydrated) return hydrated;
  hydrated = (async () => {
    try {
      const keys = await idb.keys("cache");
      for (const k of keys) { const e = await idb.get<Entry>("cache", k); if (e && !mem.has(k)) mem.set(k, e); }
    } catch { /* memory only */ }
  })();
  return hydrated;
}

export function cachePut(url: string, data: unknown) {
  const e = { data, at: Date.now() };
  mem.set(url, e);
  void idb.put("cache", url, e);
}
export function cachePeek<T>(url: string): T | undefined {
  return mem.get(url)?.data as T | undefined;
}
export async function cacheGet<T>(url: string): Promise<T | undefined> {
  const m = mem.get(url);
  if (m) return m.data as T;
  const e = await idb.get<Entry>("cache", url);
  if (e) mem.set(url, e);
  return e?.data as T | undefined;
}
export function cacheAge(url: string): number | null {
  const m = mem.get(url);
  return m ? Date.now() - m.at : null;
}
export async function cacheClear() {
  mem.clear();
  await idb.clear("cache");
}
