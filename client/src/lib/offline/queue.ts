import { create } from "zustand";
import { idb } from "./idb";
import { bus } from "./bus";
import type { CashSession, Ingredient, Order, OrderItem, OrderStatus, PaymentMethod } from "@/lib/types";
import type { Movement } from "@/app/store";

/**
 * The outbox: every operation done without a usable connection is stored here (IndexedDB) and replayed in order.
 * Each op has a UUID (`id`) that the server uses as idempotency key, so a replay after a lost response never
 * duplicates anything. Entities created offline are referenced by that same id ({client_id}) until they reach the server.
 */
export type Ref = { id: number } | { client_id: string };
export const refPath = (r: Ref) => ("id" in r ? String(r.id) : `c_${r.client_id}`);
export const refOf = (o: { id: number; client_id?: string | null }): Ref => (o.id > 0 || !o.client_id ? { id: o.id } : { client_id: o.client_id });
export const refMatches = (o: { id: number; client_id?: string | null }, r: Ref) => ("id" in r ? o.id === r.id : !!o.client_id && o.client_id === r.client_id);

interface Base { id: string; seq: number; at: string; user: { id: number; name: string }; state: "pending" | "failed"; error?: string; tries: number; label: string }
export interface OrderCreateOp extends Base { kind: "order.create"; body: Record<string, unknown>; local: Order }
export interface OrderPayOp extends Base { kind: "order.pay"; target: Ref; payment_method: PaymentMethod; cash_received: number | null }
export interface OrderStatusOp extends Base { kind: "order.status"; target: Ref; status: OrderStatus }
/** Mesas: una ronda más sobre una cuenta abierta. `totals` son los del pedido ya recalculados con los productos nuevos. */
export interface OrderItemsOp extends Base { kind: "order.items"; target: Ref; items: OrderItem[]; totals: { subtotal: number; discount: number; tax: number; total: number } }
export interface CashOpenOp extends Base { kind: "cash.open"; opening_amount: number; notes: string; local: CashSession }
export interface CashCloseOp extends Base { kind: "cash.close"; target: Ref; closing_amount: number; notes: string }
export interface StockAdjustOp extends Base { kind: "stock.adjust"; item_type: "product" | "ingredient"; target: Ref; qty: number; set: boolean; base_stock: number; reason: string; notes: string; photo: string | null; local: Movement }
export interface IngredientCreateOp extends Base { kind: "ingredient.create"; body: Record<string, unknown>; local: Ingredient; photo: string | null }
export type Op = OrderCreateOp | OrderPayOp | OrderStatusOp | OrderItemsOp | CashOpenOp | CashCloseOp | StockAdjustOp | IngredientCreateOp;
/** An op as built by the actions layer (seq/state/tries are assigned by enqueue). Distributive so each kind keeps its own fields. */
export type DraftOp = Op extends infer O ? (O extends Op ? Omit<O, "seq" | "state" | "tries"> : never) : never;

interface QueueState {
  ops: Op[];
  loaded: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  lastSyncError: string | null;
}
export const useQueue = create<QueueState>()(() => ({ ops: [], loaded: false, syncing: false, lastSyncAt: null, lastSyncError: null }));

export const pendingOps = () => useQueue.getState().ops.filter((o) => o.state === "pending");
export const pendingCount = () => pendingOps().length;
export const failedCount = () => useQueue.getState().ops.filter((o) => o.state === "failed").length;

let seq = 0;
let loading: Promise<void> | null = null;

/** Load the persisted queue (called once at boot). */
export function loadQueue(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const ops = ((await idb.all<Op>("outbox")) || []).sort((a, b) => a.seq - b.seq);
      seq = ops.reduce((m, o) => Math.max(m, o.seq), 0);
      useQueue.setState({ ops, loaded: true });
    } catch { useQueue.setState({ loaded: true }); }
  })();
  return loading;
}

export function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Append an op to the queue (persisted) and notify listeners. `op` must already carry its id/at/user/label. */
export async function enqueue(op: DraftOp): Promise<Op> {
  const full = { ...op, seq: ++seq, state: "pending", tries: 0 } as Op;
  useQueue.setState((s) => ({ ops: [...s.ops, full] }));
  await idb.put("outbox", full.id, full);
  bus.emit("sync:changed");
  return full;
}

export async function removeOp(id: string) {
  useQueue.setState((s) => ({ ops: s.ops.filter((o) => o.id !== id) }));
  await idb.del("outbox", id);
}

export async function updateOp(id: string, patch: Partial<Base>) {
  let updated: Op | undefined;
  useQueue.setState((s) => ({ ops: s.ops.map((o) => (o.id === id ? (updated = { ...o, ...patch } as Op) : o)) }));
  if (updated) await idb.put("outbox", id, updated);
}

/** Ops that reference an entity created by op `id` (they cannot succeed if that creation failed). */
export function dependents(id: string): Op[] {
  return useQueue.getState().ops.filter((o) => "target" in o && "client_id" in o.target && o.target.client_id === id);
}
