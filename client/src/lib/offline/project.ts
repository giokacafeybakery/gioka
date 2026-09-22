import { cachePeek } from "./cache";
import { pendingOps, refMatches, refPath, type Op } from "./queue";
import type { CashSession, Ingredient, LowStock, Order, Product } from "@/lib/types";
import type { Movement } from "@/app/store";

/**
 * Projection layer: applies the pending (not yet synced) operations on top of any GET response, so the UI shows
 * orders created offline, stock already discounted, the register opened on the device, etc. Pure functions over
 * the in-memory cache + queue; the server response is never mutated.
 */

const dayOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const today = () => dayOf(new Date().toISOString());
const itemKey = (type: string, o: { id: number; client_id?: string | null }) => `${type}-${o.id > 0 || !o.client_id ? o.id : `c_${o.client_id}`}`;

/** Every order we know about (cached lists + local creations), for lookups by ref. */
function knownOrders(ops: Op[]): Order[] {
  const seen = new Map<string, Order>();
  for (const url of ["/api/orders", "/api/orders?active=1"]) for (const o of cachePeek<Order[]>(url) || []) seen.set(String(o.id), o);
  for (const op of ops) if (op.kind === "order.create") seen.set(op.id, op.local);
  return [...seen.values()];
}
const findOrder = (ops: Op[], target: Parameters<typeof refMatches>[1]) => knownOrders(ops).find((o) => refMatches(o, target));

/** Net stock change per item ("product-12", "ingredient-3", "ingredient-c_<uuid>") caused by the pending ops. */
export function stockDeltas(ops: Op[] = pendingOps()): Map<string, number> {
  const products = cachePeek<Product[]>("/api/products?all=1") || cachePeek<Product[]>("/api/products") || [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const d = new Map<string, number>();
  const add = (k: string, v: number) => d.set(k, +((d.get(k) || 0) + v).toFixed(4));
  const applyOrder = (o: Order, dir: 1 | -1) => {
    for (const it of o.items) {
      const p = it.product_id != null ? byId.get(it.product_id) : undefined;
      if (!p) continue;
      if (p.track_stock) add(`product-${p.id}`, dir * it.qty);
      for (const r of p.recipe || []) add(`ingredient-${r.ingredient_id}`, dir * r.qty * it.qty);
      for (const opt of it.options || []) if (Number(opt.ingredient_id) > 0 && Number(opt.qty) > 0) add(`ingredient-${opt.ingredient_id}`, dir * Number(opt.qty) * it.qty);
    }
  };
  for (const op of ops) {
    if (op.kind === "order.create") applyOrder(op.local, -1);
    else if (op.kind === "order.status" && op.status === "cancelled") { const o = findOrder(ops, op.target); if (o && o.status !== "cancelled") applyOrder(o, 1); }
    else if (op.kind === "stock.adjust") add(`${op.item_type}-${refPath(op.target)}`, op.set ? op.qty - op.base_stock : op.qty);
  }
  return d;
}

export function projectProducts(list: Product[], ops = pendingOps()): Product[] {
  if (!ops.length) return list;
  const d = stockDeltas(ops);
  return list.map((p) => { const k = d.get(`product-${p.id}`); return k ? { ...p, stock: +(p.stock + k).toFixed(4) } : p; });
}

export function projectIngredients(list: Ingredient[], ops = pendingOps()): Ingredient[] {
  if (!ops.length) return list;
  const out = list.slice();
  for (const op of ops) if (op.kind === "ingredient.create" && !out.some((i) => i.client_id === op.id)) out.push({ ...op.local, pending: true });
  const d = stockDeltas(ops);
  return out.map((i) => { const k = d.get(itemKey("ingredient", i)); return k ? { ...i, stock: +(i.stock + k).toFixed(4) } : i; })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Apply pending order ops and re-apply the list's own filter (active / status / date) so orders move between views. */
export function projectOrders(list: Order[], query: URLSearchParams, ops = pendingOps()): Order[] {
  if (!ops.length) return list;
  let out = list.slice();
  for (const op of ops) {
    if (op.kind === "order.create") { if (!out.some((o) => o.client_id === op.id)) out.unshift({ ...op.local, pending: true }); }
    else if (op.kind === "order.pay") out = out.map((o) => (refMatches(o, op.target) && !o.paid ? { ...o, paid: true, payment_method: op.payment_method, cash_received: op.cash_received, paid_at: op.at, updated_at: op.at, pending: true } : o));
    else if (op.kind === "order.status") out = out.map((o) => (refMatches(o, op.target) && o.status !== "cancelled" ? { ...o, status: op.status, updated_at: op.at, ready_at: op.status === "ready" ? op.at : o.ready_at, delivered_at: op.status === "delivered" ? op.at : o.delivered_at, pending: true } : o));
  }
  const status = query.get("status")?.split(",").filter(Boolean);
  const date = query.get("date");
  const active = !!query.get("active");
  out = out.filter((o) => {
    if (active && !["pending", "preparing", "ready"].includes(o.status)) return false;
    if (status?.length && !status.includes(o.status)) return false;
    if (date) return dayOf(o.created_at) === date;
    if (!active && !status?.length) return dayOf(o.created_at) === today();
    return true;
  });
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function projectOrder(o: Order, ops = pendingOps()): Order {
  return projectOrders([o], new URLSearchParams("status=pending,preparing,ready,delivered,cancelled"), ops)[0] || o;
}

export function projectMovements(list: Movement[], ops = pendingOps()): Movement[] {
  if (!ops.length) return list;
  const out = list.slice();
  for (const op of ops) {
    if (op.kind === "stock.adjust" && !out.some((m) => m.client_id === op.id)) out.push({ ...op.local, pending: true });
    else if (op.kind === "ingredient.create" && op.local.stock !== 0) {
      out.push({ id: -op.seq, client_id: op.id, item_type: "ingredient", item_id: op.local.id, item_name: op.local.name, unit: op.local.unit, qty: op.local.stock, reason: "stock inicial", notes: "", photo: op.photo, order_id: null, order_number: null, user_name: op.user.name, user_role: null, created_at: op.at, pending: true });
    }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Totals of the open session including sales that were paid on the device but not yet sent. */
function withLocalTotals(s: CashSession, ops: Op[]): CashSession {
  const totals = { ...s.totals };
  const count = (o: { total: number; payment_method: string | null }) => { const m = (o.payment_method || "cash") as "cash" | "card" | "qr"; totals[m] = +((totals[m] || 0) + o.total).toFixed(2); totals.orders += 1; totals.revenue = +(totals.revenue + o.total).toFixed(2); };
  for (const op of ops) {
    if (op.kind === "order.create" && op.local.paid && op.at >= s.opened_at) count(op.local);
    else if (op.kind === "order.pay" && op.at >= s.opened_at) { const o = findOrder(ops, op.target); if (o && !o.paid) count({ total: o.total, payment_method: op.payment_method }); }
  }
  return { ...s, totals, expected_cash: +(s.opening_amount + totals.cash).toFixed(2) };
}

export function projectCash(current: CashSession | null, ops = pendingOps()): CashSession | null {
  if (!ops.length) return current;
  let s: CashSession | null = current;
  for (const op of ops) {
    if (op.kind === "cash.open") s = { ...op.local, pending: true };
    else if (op.kind === "cash.close" && s && refMatches(s, op.target)) s = null;
  }
  return s ? withLocalTotals(s, ops) : null;
}

export function projectCashHistory(list: CashSession[], ops = pendingOps()): CashSession[] {
  if (!ops.length) return list;
  let out = list.slice();
  for (const op of ops) {
    if (op.kind === "cash.open" && !out.some((s) => s.client_id === op.id)) out.unshift({ ...op.local, pending: true });
    else if (op.kind === "cash.close") out = out.map((s) => (refMatches(s, op.target) && !s.closed_at ? { ...withLocalTotals(s, ops), closed_at: op.at, closing_amount: op.closing_amount, expected_amount: withLocalTotals(s, ops).expected_cash, notes: op.notes || s.notes, pending: true } : s));
  }
  return out;
}

export function projectLow(low: LowStock, ops = pendingOps()): LowStock {
  if (!ops.some((o) => o.kind === "order.create" || o.kind === "stock.adjust" || o.kind === "order.status" || o.kind === "ingredient.create")) return low;
  const products = cachePeek<Product[]>("/api/products?all=1") || cachePeek<Product[]>("/api/products");
  const ingredients = cachePeek<Ingredient[]>("/api/inventory/ingredients");
  return {
    products: products ? projectProducts(products, ops).filter((p) => p.active && p.track_stock && p.stock <= p.min_stock).map((p) => ({ ...p, unit: "u" })) : low.products,
    ingredients: ingredients ? projectIngredients(ingredients, ops).filter((i) => i.stock <= i.min_stock) : low.ingredients,
  };
}

/** Dispatch by URL. Unknown URLs pass through untouched. */
export function project<T>(url: string, data: T): T {
  const ops = pendingOps();
  if (!ops.length) return data;
  const u = new URL(url, "http://x");
  const p = u.pathname;
  try {
    if (p === "/api/orders") return projectOrders(data as Order[], u.searchParams, ops) as T;
    if (/^\/api\/orders\/(-?\d+|c_[\w-]+)$/.test(p)) return projectOrder(data as Order, ops) as T;
    if (p === "/api/products") return projectProducts(data as Product[], ops) as T;
    if (p === "/api/inventory/ingredients") return projectIngredients(data as Ingredient[], ops) as T;
    if (p === "/api/inventory/movements") return projectMovements(data as Movement[], ops) as T;
    if (p === "/api/inventory/low") return projectLow(data as LowStock, ops) as T;
    if (p === "/api/cash/current") return projectCash(data as CashSession | null, ops) as T;
    if (p === "/api/cash/history") return projectCashHistory(data as CashSession[], ops) as T;
  } catch (e) { console.error("projection", e); }
  return data;
}

/** Next order number for today as seen from this device (cached orders + local ones). */
export function nextDailyNumber(): number {
  const t = today();
  let max = 0;
  for (const o of knownOrders(pendingOps())) if (dayOf(o.created_at) === t) max = Math.max(max, o.daily_number);
  return max + 1;
}
