import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useNet, onOnline } from "./net";
import type { Role } from "@/lib/types";

/**
 * Pre-load into the read cache everything a device may need without connection, according to the user's role.
 * Runs after login, at startup, whenever the connection comes back and every few minutes while online, so a
 * register that has been online at any point today can keep working the whole day if the internet drops.
 */
const URLS: Record<Role, string[]> = {
  admin: ["/api/settings", "/api/categories", "/api/products", "/api/products?all=1", "/api/orders", "/api/orders?active=1", "/api/cash/current", "/api/cash/history", "/api/inventory/ingredients", "/api/inventory/low", "/api/inventory/movements?limit=200", "/api/inventory/movements?limit=100&manual=1"],
  cajero: ["/api/settings", "/api/categories", "/api/products", "/api/orders", "/api/orders?active=1", "/api/cash/current", "/api/cash/history"],
  cocina: ["/api/settings", "/api/orders"],
  inventario: ["/api/settings", "/api/inventory/ingredients", "/api/products?all=1", "/api/inventory/movements?limit=200"],
};

let running = false;
export async function warmCache() {
  const user = useAuth.getState().user;
  if (!user || !useNet.getState().online || running) return;
  running = true;
  try {
    for (const url of URLS[user.role] || []) {
      if (!useNet.getState().online) break;
      await api.get(url).catch(() => {});
    }
  } finally { running = false; }
}

let started = false;
export function startWarm() {
  if (started) return;
  started = true;
  onOnline(() => { void warmCache(); });
  useAuth.subscribe((s, prev) => { if (s.user && s.user.id !== prev.user?.id) void warmCache(); });
  setInterval(() => { if (document.visibilityState === "visible") void warmCache(); }, 5 * 60_000);
}
