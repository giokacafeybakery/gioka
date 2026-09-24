import { create } from "zustand";
import type { Order } from "./types";

/**
 * Estación de impresión: **ajuste por dispositivo** (no del negocio), guardado en localStorage.
 *
 * El mesero toma el pedido desde su teléfono, pero no imprime (ni tiene impresora). La computadora
 * de caja —o la del admin— se marca como estación: escucha `order:created` en vivo y manda la comanda
 * a la impresora sin que nadie toque nada. Solo un dispositivo debería tenerlo activo, si no se imprime
 * una copia por cada uno.
 */
export interface PrintStationConfig {
  /** Este dispositivo imprime automáticamente los pedidos que llegan de otros. */
  enabled: boolean;
  /** Comanda de cocina (lo que se prepara). */
  kitchen: boolean;
  /** Ticket del cliente. */
  ticket: boolean;
  /** Solo los pedidos tomados por un mesero (si no, cualquier pedido de otro dispositivo). */
  onlyWaiter: boolean;
}

const KEY = "gioka.print-station";
const DEFAULT: PrintStationConfig = { enabled: false, kitchen: true, ticket: false, onlyWaiter: true };

function read(): PrintStationConfig {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<PrintStationConfig>) } : DEFAULT;
  } catch { return DEFAULT; }
}

interface StationState { cfg: PrintStationConfig; set: (patch: Partial<PrintStationConfig>) => void }

export const usePrintStation = create<StationState>()((set, get) => ({
  cfg: read(),
  set: (patch) => {
    const cfg = { ...get().cfg, ...patch };
    set({ cfg });
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* modo privado */ }
  },
}));

/** Clave estable de un pedido (los creados sin conexión todavía no tienen id del servidor). */
const keysOf = (o: Order) => {
  const cid = (o as Order & { client_id?: string }).client_id;
  return [o.id ? `id:${o.id}` : "", cid ? `c:${cid}` : ""].filter(Boolean);
};

/** Pedidos creados en ESTE dispositivo: el eco de Realtime no debe volver a imprimirlos. */
const mine = new Set<string>();
export function markLocalOrder(o: Order) { for (const k of keysOf(o)) mine.add(k); }
export const isLocalOrder = (o: Order) => keysOf(o).some((k) => mine.has(k));

/** Pedidos ya impresos por la estación (evita duplicados si el evento llega dos veces). */
const printed = new Set<string>();
export function claimPrint(o: Order) {
  const keys = keysOf(o);
  if (keys.some((k) => printed.has(k))) return false;
  for (const k of keys) printed.add(k);
  return true;
}
