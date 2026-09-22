import { api, isOffline, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import { useCash } from "@/store/cash";
import { cartTotals, lineUnitPrice, type CartLine } from "@/store/cart";
import { money } from "@/lib/format";
import type { CashSession, Ingredient, Order, OrderStatus, OrderType, PaymentMethod, Product, User } from "@/lib/types";
import type { Movement } from "@/app/store";
import { useNet } from "@/lib/offline/net";
import { bus } from "@/lib/offline/bus";
import { enqueue, pendingCount, failedCount, refOf, uuid, type Op, type DraftOp } from "@/lib/offline/queue";
import { sendOp } from "@/lib/offline/sync";
import { nextDailyNumber } from "@/lib/offline/project";
import { vault } from "@/lib/offline/vault";

/**
 * Domain actions used by the screens. Every write goes through here:
 *  - online and nothing queued → sent directly (the server validates as always);
 *  - otherwise (offline, server unreachable, or ops already waiting so order must be kept) → stored in the outbox,
 *    applied locally right away and sent automatically later.
 * Each result says whether it was `queued`, so the UI can show "guardado en este dispositivo".
 */
export interface Done<T> { result: T; queued: boolean }

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = (prefix: string) => `${prefix}-${Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join("")}`;
const nowISO = () => new Date().toISOString();
const me = () => {
  const u = useAuth.getState().user;
  if (!u) throw new ApiError(401, "No autorizado");
  return u;
};
/** Direct send is only allowed when online AND the queue is empty (otherwise a later op could overtake an earlier one). */
const canDirect = () => useNet.getState().online && pendingCount() === 0;

async function perform<T>(op: DraftOp, local: T, announce: (r: T) => void): Promise<Done<T>> {
  if (canDirect()) {
    try { return { result: await sendOp<T>(op as Op, false), queued: false }; }
    catch (e) { if (!isOffline(e)) throw e; }
  }
  await enqueue(op);
  announce(local);
  return { result: local, queued: true };
}

// ---------------------------------------------------------------- auth

export async function login(email: string, password: string): Promise<{ token: string | null; user: User; offline: boolean }> {
  try {
    const r = await api.post<{ token: string; user: User }>("/api/auth/login", { email: email.trim(), password });
    void vault.remember(email, password, r.token, r.user);
    return { ...r, offline: false };
  } catch (e) {
    if (!isOffline(e)) throw e;
    const entry = await vault.verify(email, password);
    if (entry) return { token: entry.token, user: entry.user, offline: true };
    throw new ApiError(0, (await vault.has(email)) ? "Contraseña incorrecta (verificada sin conexión)" : "Sin conexión. Solo puedes entrar con una cuenta que ya haya iniciado sesión en este dispositivo.");
  }
}

/** Ends the session on the server only when nothing is waiting to be sent, so the stored token can still sync the queue later. */
export async function logout() {
  const { user, token } = useAuth.getState();
  if (token && useNet.getState().online && pendingCount() + failedCount() === 0) {
    try { await api.post("/api/auth/logout"); if (user) await vault.forgetToken(user.email); } catch { /* ignore */ }
  }
  useAuth.getState().logout();
}

// ---------------------------------------------------------------- orders

export interface NewOrder {
  lines: CartLine[]; type: OrderType; customer_name: string; customer_phone: string; table_no: string; notes: string; discount: number;
  payment_method: PaymentMethod | null; cash_received: number | null;
  /** Products as currently shown (already projected) — used to validate stock when the server cannot. */
  products: Product[];
  /** Extra order fields passed through untouched (e.g. delivery address). */
  extra?: Record<string, unknown>;
}

export async function createOrder(input: NewOrder): Promise<Done<Order>> {
  const user = me();
  const settings = useSettings.getState().settings;
  if (!input.lines.length) throw new ApiError(400, "El pedido está vacío");
  // Local validation mirrors the server so the cashier gets the same answer with or without connection.
  for (const l of input.lines) {
    const p = input.products.find((x) => x.id === l.product.id);
    if (p && p.track_stock && p.stock < l.qty) throw new ApiError(400, `Stock insuficiente de ${p.name} (quedan ${p.stock})`);
  }
  if (user.role !== "mesero" && !canDirect() && !useCash.getState().session) throw new ApiError(409, "La caja está cerrada. Abre la caja para poder vender.");

  const totals = cartTotals(input.lines, input.discount, settings?.tax_rate || 0);
  const at = nowISO();
  const id = uuid();
  const paid = user.role !== "mesero" && !!input.payment_method;
  // Unit price includes the extras of the chosen sabores/adicionales; the selection travels with the item (KDS, ticket).
  const items = input.lines.map((l) => ({ product_id: l.product.id, name: l.product.name, emoji: l.product.emoji, price: lineUnitPrice(l), qty: l.qty, notes: l.notes, options: l.options || [] }));
  const cash_received = paid && input.payment_method === "cash" && input.cash_received != null ? input.cash_received : null;
  const local = {
    id: -Date.now(), client_id: id, code: genCode(settings?.order_prefix || "G"), daily_number: nextDailyNumber(), type: input.type,
    customer_name: input.customer_name.trim(), customer_phone: input.customer_phone.trim(), table_no: input.table_no, ...(input.extra || {}),
    status: "pending" as OrderStatus, payment_method: paid ? input.payment_method : null, paid, subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, total: totals.total,
    cash_received, notes: input.notes, user_id: user.id, user_name: user.name, user_role: user.role, created_at: at, updated_at: at, paid_at: paid ? at : null, ready_at: null, delivered_at: null,
    items, offline: true, pending: true,
  } as Order;
  const body = {
    type: input.type, customer_name: input.customer_name, customer_phone: input.customer_phone, table_no: input.table_no, ...(input.extra || {}), notes: input.notes, discount: input.discount,
    payment_method: paid ? input.payment_method : null, cash_received, items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, notes: i.notes, price: i.price, options: i.options })),
  };
  return perform<Order>({ id, kind: "order.create", at, user: { id: user.id, name: user.name }, label: `Pedido #${local.daily_number} · ${money(local.total)}`, body, local }, local,
    (o) => { bus.emit("order:created", o); bus.emit("stock:updated", { item_type: "product", item: null }); });
}

export async function payOrder(order: Order, payment_method: PaymentMethod, cash_received: number | null = null): Promise<Done<Order>> {
  const user = me();
  if (order.paid) throw new ApiError(400, "El pedido ya está pagado");
  if (!canDirect() && !useCash.getState().session) throw new ApiError(409, "La caja está cerrada. Abre la caja para cobrar.");
  const at = nowISO();
  const local: Order = { ...order, paid: true, payment_method, cash_received: payment_method === "cash" ? cash_received : null, paid_at: at, updated_at: at, pending: true };
  return perform<Order>({ id: uuid(), kind: "order.pay", at, user: { id: user.id, name: user.name }, label: `Cobro pedido #${order.daily_number} · ${money(order.total)}`, target: refOf(order), payment_method, cash_received: local.cash_received }, local,
    (o) => bus.emit("order:updated", o));
}

/** Cashier/admin closes an unpaid ready order in one server transaction. */
export async function checkoutOrder(order: Order, customer_name: string, payment_method: PaymentMethod, cash_received: number | null): Promise<Order> {
  const user = me();
  if (!["admin", "cajero"].includes(user.role)) throw new ApiError(403, "Solo caja o administración puede entregar y cobrar");
  return api.post<Order>(`/api/orders/${order.id}/checkout`, { customer_name: customer_name.trim(), payment_method, cash_received });
}

export async function setOrderStatus(order: Order, status: OrderStatus): Promise<Done<Order>> {
  const user = me();
  if (order.status === status) return { result: order, queued: false };
  const at = nowISO();
  const local: Order = { ...order, status, updated_at: at, ready_at: status === "ready" ? at : order.ready_at, delivered_at: status === "delivered" ? at : order.delivered_at, pending: true };
  const labels: Record<OrderStatus, string> = { pending: "Pendiente", preparing: "En preparación", ready: "Listo", delivered: "Entregado", cancelled: "Cancelado", refunded: "Devuelto" };
  return perform<Order>({ id: uuid(), kind: "order.status", at, user: { id: user.id, name: user.name }, label: `Pedido #${order.daily_number} → ${labels[status]}`, target: refOf(order), status }, local,
    (o) => { bus.emit("order:updated", o); if (status === "cancelled") bus.emit("stock:updated", { item_type: "product", item: null }); });
}

// ---------------------------------------------------------------- cash register

export async function openCash(input: { opening_amount: number; email: string; password: string; notes: string }): Promise<Done<CashSession>> {
  me();
  if (canDirect()) {
    try { return { result: await api.post<CashSession>("/api/cash/open", input), queued: false }; }
    catch (e) { if (!isOffline(e)) throw e; }
  }
  // Without connection the password is checked against the local vault (only accounts that logged in on this device).
  const entry = await vault.verify(input.email, input.password);
  if (!entry) throw new ApiError(401, (await vault.has(input.email)) ? "Contraseña incorrecta (verificada sin conexión)" : "Sin conexión: solo puede abrir la caja un usuario que ya haya iniciado sesión en este dispositivo");
  if (!["admin", "cajero"].includes(entry.user.role)) throw new ApiError(403, "Ese usuario no puede operar la caja");
  if (useCash.getState().session) throw new ApiError(400, "Ya hay una caja abierta");
  if (!Number.isFinite(input.opening_amount) || input.opening_amount < 0) throw new ApiError(400, "Registra el monto inicial de la caja");
  const at = nowISO();
  const id = uuid();
  const local: CashSession = {
    id: -Date.now(), client_id: id, user_id: entry.user.id, user_name: entry.user.name, opening_amount: input.opening_amount, closing_amount: null, expected_amount: null,
    notes: input.notes, opened_at: at, closed_at: null, totals: { cash: 0, card: 0, qr: 0, orders: 0, revenue: 0 }, cancelled: 0, expected_cash: input.opening_amount, offline: true, pending: true,
  };
  await enqueue({ id, kind: "cash.open", at, user: { id: entry.user.id, name: entry.user.name }, label: `Apertura de caja · ${money(input.opening_amount)} · ${entry.user.name}`, opening_amount: input.opening_amount, notes: input.notes, local });
  bus.emit("cash:updated", local);
  return { result: local, queued: true };
}

export async function closeCash(session: CashSession, input: { closing_amount: number; notes: string }): Promise<Done<CashSession | null>> {
  const user = me();
  if (user.role !== "admin" && session.user_id !== user.id) throw new ApiError(403, "Solo el cajero que abrió la caja (o un administrador) puede cerrarla");
  const at = nowISO();
  const local: CashSession = { ...session, closing_amount: input.closing_amount, expected_amount: session.expected_cash, notes: input.notes || session.notes, closed_at: at, pending: true };
  const r = await perform<CashSession | null>({ id: uuid(), kind: "cash.close", at, user: { id: user.id, name: user.name }, label: `Cierre de caja · contado ${money(input.closing_amount)}`, target: refOf(session), closing_amount: input.closing_amount, notes: input.notes }, local,
    () => bus.emit("cash:updated", null));
  return r;
}

// ---------------------------------------------------------------- inventory

export interface StockAdjust {
  item_type: "product" | "ingredient";
  item: { id: number; client_id?: string | null; name: string; unit: string; stock: number };
  /** Delta (+ entrada / − salida), or the absolute value when `set` is true. */
  qty: number; set: boolean; reason: string; notes: string; photo: string | null;
}

export async function adjustStock(input: StockAdjust): Promise<Done<unknown>> {
  const user = me();
  const delta = input.set ? input.qty - input.item.stock : input.qty;
  if (!Number.isFinite(delta) || delta === 0) throw new ApiError(400, "Cantidad inválida");
  if (user.role === "inventario" && !input.photo) throw new ApiError(400, "Adjunta la foto del comprobante");
  const at = nowISO();
  const id = uuid();
  const reason = input.reason || (delta > 0 ? "entrada" : "salida");
  const local: Movement = {
    id: -Date.now(), client_id: id, item_type: input.item_type, item_id: input.item.id, item_name: input.item.name, unit: input.item.unit, qty: +delta.toFixed(4), reason, notes: input.notes,
    photo: input.photo, order_id: null, order_number: null, user_name: user.name, user_role: user.role, created_at: at, pending: true,
  };
  return perform<unknown>({
    id, kind: "stock.adjust", at, user: { id: user.id, name: user.name }, label: `${delta > 0 ? "Entrada" : "Salida"} · ${input.item.name} (${delta > 0 ? "+" : ""}${+delta.toFixed(3)} ${input.item.unit})`,
    item_type: input.item_type, target: refOf(input.item), qty: input.qty, set: input.set, base_stock: input.item.stock, reason, notes: input.notes, photo: input.photo, local,
  }, local, () => bus.emit("stock:updated", { item_type: input.item_type, item: null }));
}

export async function createIngredient(body: { name: string; image?: string | null; unit?: string; stock?: number; min_stock?: number; cost?: number; supplier?: string; is_topping?: boolean; photo?: string | null }): Promise<Done<Ingredient>> {
  const user = me();
  if (!body.name?.trim()) throw new ApiError(400, "Nombre requerido");
  const stock = Number(body.stock || 0);
  if (user.role === "inventario" && stock !== 0 && !body.photo) throw new ApiError(400, "Adjunta la foto del comprobante del stock inicial");
  const at = nowISO();
  const id = uuid();
  const clean = { name: body.name.trim(), image: body.image || null, unit: body.unit || "u", stock, min_stock: Number(body.min_stock || 0), cost: Number(body.cost || 0), supplier: body.supplier || "", is_topping: !!body.is_topping };
  const local: Ingredient = { id: -Date.now(), client_id: id, ...clean, used_in: 0, pending: true };
  return perform<Ingredient>({ id, kind: "ingredient.create", at, user: { id: user.id, name: user.name }, label: `Nuevo insumo · ${clean.name}`, body: clean, local, photo: stock !== 0 ? body.photo || null : null }, local,
    () => bus.emit("stock:updated", { item_type: "ingredient", item: null }));
}
