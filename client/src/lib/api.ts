import { useAuth } from "@/store/auth";
import { useNet, reportFailure, reportSuccess } from "./offline/net";
import { cacheGet, cachePut } from "./offline/cache";
import { project } from "./offline/project";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code; }
}
/** The server could not be reached (network down, timeout, proxy error) or it cannot reach its database. */
export class OfflineError extends ApiError {
  constructor(message = "Sin conexión") { super(0, message, "offline"); }
}
export const isOffline = (e: unknown) => e instanceof OfflineError;

const NO_CACHE = /^\/api\/(auth|health|print)/;
/** Lists that can start empty when nothing was cached yet: the pending local operations are still projected on top. */
function emptyBase(url: string): unknown {
  const p = url.split("?")[0];
  if (p === "/api/orders" || p === "/api/inventory/movements" || p === "/api/cash/history") return [];
  if (p === "/api/cash/current") return null;
  if (p === "/api/inventory/low") return { products: [], ingredients: [] };
  return undefined;
}

/**
 * Raw request. Network failures and 5xx gateway/db_offline answers become OfflineError and flip the connectivity state;
 * ordinary API errors (400/401/403/404/409…) are thrown as ApiError like before.
 */
export async function request<T>(method: string, url: string, body?: unknown, opts: { timeout?: number } = {}): Promise<T> {
  const token = useAuth.getState().token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? (method === "GET" ? 12_000 : 15_000));
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    reportFailure(navigator.onLine ? "No se pudo contactar al servidor" : "Sin conexión a la red");
    throw new OfflineError();
  }
  clearTimeout(timer);
  const data = await res.json().catch(() => ({})) as { error?: string; code?: string };
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    reportFailure(data.code === "db_offline" ? "El servidor no puede acceder a la base de datos" : "El servidor no responde");
    throw new OfflineError(data.error || "Sin conexión");
  }
  reportSuccess();
  if (res.status === 401 && token) useAuth.getState().logout();
  if (!res.ok) throw new ApiError(res.status, data.error || `Error ${res.status}`, data.code);
  return data as T;
}

/**
 * GET with offline support: online → network (response cached); offline or unreachable → last cached copy.
 * Pending offline operations are projected on top of both, so the UI is consistent either way.
 */
async function get<T>(url: string): Promise<T> {
  if (useNet.getState().online || !NO_CACHE.test(url) && !(await cacheGet(url))) {
    try {
      const data = await request<T>("GET", url);
      if (!NO_CACHE.test(url)) cachePut(url, data);
      return project(url, data);
    } catch (e) {
      if (!isOffline(e) || NO_CACHE.test(url)) throw e;
    }
  }
  const hit = await cacheGet<T>(url);
  if (hit !== undefined) return project(url, hit);
  const empty = emptyBase(url);
  if (empty !== undefined) return project(url, empty as T);
  throw new OfflineError("Sin conexión y sin datos guardados en este dispositivo");
}

const MEM_CACHE = new Map<string, { t: number; v: unknown }>();
export const api = {
  get: async <T>(url: string): Promise<T> => {
    if (!NO_CACHE.test(url)) {
      const hit = MEM_CACHE.get(url);
      if (hit && Date.now() - hit.t < 30_000) return hit.v as T;
    }
    const res = await get<T>(url);
    if (!NO_CACHE.test(url)) MEM_CACHE.set(url, { t: Date.now(), v: res });
    return res;
  },
  post: async <T>(url: string, body?: unknown) => { MEM_CACHE.clear(); return request<T>("POST", url, body); },
  put: async <T>(url: string, body?: unknown) => { MEM_CACHE.clear(); return request<T>("PUT", url, body); },
  patch: async <T>(url: string, body?: unknown) => { MEM_CACHE.clear(); return request<T>("PATCH", url, body); },
  delete: async <T>(url: string) => { MEM_CACHE.clear(); return request<T>("DELETE", url); },
  clearCache: () => MEM_CACHE.clear(),
};
