import type { Role } from "./types";

const UI_KEY = "gioka.ui";
/** Interfaz elegida a mano en este dispositivo ("desktop" o "mobile"), si el admin cambió de una a otra. */
export function uiPreference(): "desktop" | "mobile" | null {
  try { const v = localStorage.getItem(UI_KEY); return v === "desktop" || v === "mobile" ? v : null; } catch { return null; }
}
export function setUiPreference(v: "desktop" | "mobile" | null) {
  try { v ? localStorage.setItem(UI_KEY, v) : localStorage.removeItem(UI_KEY); } catch { /* modo privado */ }
}

/** Where a user lands after login: the mobile PWA for inventory managers (and admins on phones / installed app). */
export function homeFor(role: Role) {
  const mobile = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true || window.innerWidth < 768;
  if (role === "inventario") return "/app";
  if (role === "cocina") return "/pedidos";
  if (role === "mesero") return "/pos";
  // El admin puede saltar de una interfaz a la otra; su elección manda sobre el tamaño de la pantalla.
  const pref = uiPreference();
  if (role === "admin" && (pref === "mobile" || (mobile && pref !== "desktop"))) return "/app";
  return role === "cajero" ? "/caja" : "/pos";
}
