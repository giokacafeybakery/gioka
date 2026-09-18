import { create } from "zustand";

/**
 * Connectivity state. "online" means the API answered AND reached the database (GET /api/health),
 * so a server on the café's LAN whose Supabase link dropped counts as offline too.
 *
 * Signals: browser online/offline events, the Realtime channel (re)joining, every failed/successful API call, and a
 * periodic probe (fast backoff while offline, a light check every minute while online). When we come back online the
 * registered listeners run (the sync engine flushes the queue).
 */
interface NetState {
  online: boolean;
  checking: boolean;
  since: number;            // when the current state started
  lastError: string | null;
  /** True when the app has decided at least once (avoids flashing "sin conexión" during boot). */
  known: boolean;
}

export const useNet = create<NetState>()(() => ({ online: typeof navigator === "undefined" ? true : navigator.onLine, checking: false, since: Date.now(), lastError: null, known: false }));

const onlineListeners = new Set<() => void>();
export const onOnline = (fn: () => void) => { onlineListeners.add(fn); return () => { onlineListeners.delete(fn); }; };

let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let probing: Promise<boolean> | null = null;

function setOnline(online: boolean, error: string | null = null) {
  const s = useNet.getState();
  const changed = s.online !== online || !s.known;
  useNet.setState({ online, known: true, lastError: online ? null : error, since: changed ? Date.now() : s.since });
  if (online) failures = 0;
  if (changed && online) for (const fn of [...onlineListeners]) { try { fn(); } catch (e) { console.error(e); } }
  schedule();
}

/** Ask the server whether it can serve us (API + database). Cheap, no auth, never cached. */
export function probe(): Promise<boolean> {
  if (probing) return probing;
  useNet.setState({ checking: true });
  probing = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(`/api/health?t=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
      const ok = r.ok;
      setOnline(ok, ok ? null : "El servidor no puede acceder a la base de datos");
      return ok;
    } catch {
      setOnline(false, "No se pudo contactar al servidor");
      return false;
    } finally {
      clearTimeout(t);
      useNet.setState({ checking: false });
      probing = null;
    }
  })();
  return probing;
}

/** Called by the API layer when a request could not reach the server (or the server reported db_offline). */
export function reportFailure(reason?: string) {
  failures++;
  if (useNet.getState().online) setOnline(false, reason || "Sin conexión");
  else schedule();
}
/** Called by the API layer after any successful response: we are definitely online. */
export function reportSuccess() {
  if (!useNet.getState().online || !useNet.getState().known) setOnline(true);
}

function schedule() {
  if (timer) clearTimeout(timer);
  const { online } = useNet.getState();
  // Offline: 4 s, 8 s, 16 s… up to 30 s. Online: light check every 60 s (catches a database outage behind a healthy server).
  const delay = online ? 60_000 : Math.min(30_000, 4000 * 2 ** Math.min(failures, 3));
  timer = setTimeout(() => { probe(); }, delay);
}

let started = false;
/** Start listening to the browser and probing. Safe to call more than once. */
export function startNet() {
  if (started) return;
  started = true;
  window.addEventListener("online", () => probe());
  window.addEventListener("offline", () => setOnline(false, "Sin conexión a la red"));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") probe(); });
  if (!navigator.onLine) setOnline(false, "Sin conexión a la red");
  else probe();
}
