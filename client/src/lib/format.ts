import type { OrderStatus, OrderType, PaymentMethod, Role } from "./types";
import { useSettings } from "@/store/settings";

export function money(n: number | null | undefined, currency?: string) {
  const cur = currency ?? useSettings.getState().settings?.currency ?? "$";
  const v = Number(n || 0);
  return `${cur}${v.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const num = (n: number, d = 0) => Number(n || 0).toLocaleString("es", { maximumFractionDigits: d });

export const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : "—");
export const dateShort = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short" }) : "—");
export const dateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const daysAgoISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

export function elapsed(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export const STATUS: Record<OrderStatus, { label: string; color: string; soft: string; text: string }> = {
  pending:   { label: "Pendiente",  color: "bg-butter", soft: "bg-butter-soft", text: "text-[#9a6b00]" },
  preparing: { label: "Preparando", color: "bg-sky",    soft: "bg-sky-soft",    text: "text-[#0f6f95]" },
  ready:     { label: "Listo",      color: "bg-mint",   soft: "bg-mint-soft",   text: "text-[#1f7a56]" },
  delivered: { label: "Entregado",  color: "bg-ink-3",  soft: "bg-cream-2",     text: "text-ink-3" },
  cancelled: { label: "Cancelado",  color: "bg-berry",  soft: "bg-berry-soft",  text: "text-berry" },
};
export const TYPE: Record<OrderType, { label: string; short: string }> = {
  takeaway: { label: "Para llevar", short: "Llevar" },
  delivery: { label: "Delivery", short: "Delivery" },
  dinein:   { label: "En mesa", short: "Mesa" },
};
export const PAYMENT: Record<PaymentMethod, string> = { cash: "Efectivo", card: "Tarjeta", qr: "QR / Transf." };
export const ROLE: Record<Role, string> = { admin: "Administrador", cajero: "Cajero", cocina: "Cocina" };

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
};
