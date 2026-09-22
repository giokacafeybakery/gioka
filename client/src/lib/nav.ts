import type { Role } from "./types";

/** Where a user lands after login: the mobile PWA for inventory managers (and admins on phones / installed app). */
export function homeFor(role: Role) {
  const mobile = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true || window.innerWidth < 768;
  if (role === "inventario") return "/app";
  if (role === "cocina") return "/pedidos";
  if (role === "mesero") return "/pos";
  if (role === "admin" && mobile) return "/app";
  return role === "cajero" ? "/caja" : "/pos";
}
