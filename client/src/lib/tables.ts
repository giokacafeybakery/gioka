import type { Order, OrderItem, OrderStatus } from "./types";

/**
 * Mesas del salón: una mesa está ocupada mientras tenga pedidos en mesa sin cobrar y todavía en curso.
 * Toda la pantalla de Mesas se deriva de `/api/orders?active=1`, así que funciona igual sin conexión
 * (la caché y la proyección de la cola ya entregan esos pedidos).
 */

/** An open account: everything the table owes, across the rounds it has been ordering. */
export interface TableAccount {
  /** Normalized key used to match orders of the same table ("12" y " 12 " son la misma mesa). */
  key: string;
  /** Number as the cashier wrote it on the first order. */
  table: string;
  /** Open orders of the table, oldest first. */
  orders: Order[];
  /** Customer names on the account, without repeats. */
  names: string;
  units: number;
  /** Cuántas veces ha pedido la mesa (la primera comanda cuenta como una). */
  rounds: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  opened_at: string;
  last_at: string;
  /** Overall kitchen state: pendiente mientras quede algo sin preparar, listo cuando todo lo está. */
  status: Extract<OrderStatus, "pending" | "preparing" | "ready">;
  /** Some part of the account is still waiting to reach the server. */
  pending: boolean;
}

/** One round of a table: what was ordered together, within a single order. */
export interface TableRound {
  order: Order;
  round: number;
  at: string;
  items: OrderItem[];
  total: number;
}

export const tableKey = (table: string) => table.trim().toLowerCase().replace(/\s+/g, " ");

const OPEN: OrderStatus[] = ["pending", "preparing", "ready"];
/** An order that keeps a table busy: en mesa, sin cobrar y todavía en curso. */
export const isOpenTableOrder = (o: Order) => o.type === "dinein" && !o.paid && OPEN.includes(o.status) && tableKey(o.table_no || "").length > 0;

const worst = (orders: Order[]): TableAccount["status"] =>
  orders.some((o) => o.status === "pending") ? "pending" : orders.some((o) => o.status === "preparing") ? "preparing" : "ready";

/** Group the open orders into one account per table, sorted by table number (numeric when possible). */
export function tableAccounts(orders: Order[]): TableAccount[] {
  const by = new Map<string, Order[]>();
  for (const o of orders.filter(isOpenTableOrder)) {
    const k = tableKey(o.table_no);
    by.set(k, [...(by.get(k) || []), o]);
  }
  const out: TableAccount[] = [];
  for (const [key, list] of by) {
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const sum = (f: (o: Order) => number) => +sorted.reduce((s, o) => s + f(o), 0).toFixed(2);
    const names = [...new Set(sorted.map((o) => o.customer_name.trim()).filter(Boolean))].join(", ");
    out.push({
      key,
      table: sorted[0].table_no.trim(),
      orders: sorted,
      names,
      units: sorted.reduce((s, o) => s + o.items.reduce((n, i) => n + i.qty, 0), 0),
      rounds: sorted.reduce((s, o) => s + new Set(o.items.map((i) => i.round || 1)).size, 0),
      subtotal: sum((o) => o.subtotal), discount: sum((o) => o.discount), tax: sum((o) => o.tax), total: sum((o) => o.total),
      opened_at: sorted[0].created_at,
      last_at: sorted.map((o) => o.updated_at || o.created_at).sort().at(-1) || sorted[0].created_at,
      status: worst(sorted),
      pending: sorted.some((o) => o.pending),
    });
  }
  return out.sort((a, b) => {
    const na = Number(a.table.replace(/\D+/g, "")), nb = Number(b.table.replace(/\D+/g, ""));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.table.localeCompare(b.table, "es", { numeric: true });
  });
}

/** The account broken into rounds, in the order they were ordered, for the detail view and the bill. */
export function accountRounds(account: TableAccount): TableRound[] {
  const out: TableRound[] = [];
  for (const order of account.orders) {
    const by = new Map<number, OrderItem[]>();
    for (const it of order.items) {
      const r = it.round || 1;
      by.set(r, [...(by.get(r) || []), it]);
    }
    for (const [round, items] of [...by].sort((a, b) => a[0] - b[0])) {
      out.push({
        order, round, items,
        at: items.find((i) => i.added_at)?.added_at || order.created_at,
        total: +items.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2),
      });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** The account as a single list of products (same product + same options summed), for the charge summary. */
export function accountItems(account: TableAccount): (OrderItem & { key: string })[] {
  const by = new Map<string, OrderItem & { key: string }>();
  for (const o of account.orders) {
    for (const it of o.items) {
      const key = `${it.product_id}|${(it.options || []).map((x) => `${x.group}=${x.name}`).sort().join("|")}|${it.price}`;
      const found = by.get(key);
      if (found) found.qty += it.qty;
      else by.set(key, { ...it, key });
    }
  }
  return [...by.values()];
}
