import { Router } from "express";
import { emit } from "../realtime.js";
import { get, all, run, now, getSettings, transaction, localDayBounds, clientTime, clientId } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";
import { receiptBuffer, sendToPrinter } from "../escpos.js";

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function genCode(prefix) {
  let c;
  do {
    c = prefix + "-" + Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join("");
  } while (await get("SELECT 1 FROM orders WHERE code=?", c));
  return c;
}
const localDayStart = () => localDayBounds().start;
const id = (v) => Number(v) || 0;

/** Orders are addressed by numeric id or, for ones created offline, by "c_<client_id>". */
export async function loadOrder(ref) {
  const o = typeof ref === "string" && ref.startsWith("c_")
    ? await get("SELECT o.*, u.name AS user_name, u.role AS user_role FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.client_id=?", ref.slice(2))
    : await get("SELECT o.*, u.name AS user_name, u.role AS user_role FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.id=?", id(ref));
  if (!o) return null;
  o.items = await all("SELECT * FROM order_items WHERE order_id=? ORDER BY id", o.id);
  o.paid = !!o.paid; o.offline = !!o.offline;
  return o;
}
export async function loadOrders(where = "", params = [], { limit = 50, offset = 0 } = {}) {
  const rows = await all(`SELECT o.*, u.name AS user_name, u.role AS user_role FROM orders o LEFT JOIN users u ON u.id=o.user_id ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const items = await all(`SELECT * FROM order_items WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ...ids);
  const byOrder = {};
  for (const it of items) (byOrder[it.order_id] ||= []).push(it);
  return rows.map((r) => ({ ...r, paid: !!r.paid, offline: !!r.offline, items: byOrder[r.id] || [] }));
}

/** Cash session to attach to an operation that happened at `iso`: the one open at that moment, else the currently open one. */
async function sessionAt(iso) {
  return (await get("SELECT id FROM cash_sessions WHERE opened_at <= ? AND (closed_at IS NULL OR closed_at >= ?) ORDER BY id DESC LIMIT 1", iso, iso))
    || (await get("SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1"))
    || null;
}

/** Customer data every order must carry before it can be sold/charged, by type. Returns the error message or null. */
export function customerError(type, c) {
  const has = (v) => String(v || "").trim().length > 0;
  if (type === "dinein") return has(c.table_no) ? null : "Indica el número de mesa";
  if (!has(c.customer_name)) return "Indica el nombre del cliente";
  if (type === "delivery") {
    if (!has(c.customer_phone)) return "Indica el teléfono del cliente";
    if (!has(c.customer_address)) return "Indica la dirección de entrega";
    if (!has(c.customer_reference)) return "Indica un punto de referencia para el repartidor";
  }
  return null;
}

/**
 * Resolve the options chosen for an item (sabores / adicionales) against the product's groups.
 * Online the catalogue is authoritative: unknown choices are rejected, required groups must be chosen and a `single`
 * group takes one choice. On an offline replay (`lenient`) the selection the device recorded is kept as is.
 * A choice linked to an ingredient (`ingredient_id`/`qty`) keeps that consumption so the sale discounts its stock.
 * Returns [{ group, name, price, ingredient_id?, qty? }].
 */
export function pickOptions(product, selected, lenient = false) {
  const groups = Array.isArray(product.options) ? product.options : [];
  const sel = (Array.isArray(selected) ? selected : []).filter((s) => s && typeof s === "object");
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  const out = [];
  const withConsumption = (s) => {
    const c = { group: s.group, name: s.name, price: Number(s.price) || 0 };
    if (Number(s.ingredient_id) > 0 && Number(s.qty) > 0) { c.ingredient_id = Number(s.ingredient_id); c.qty = Math.round(Number(s.qty) * 1000) / 1000; }
    return c;
  };
  for (const g of groups) {
    const found = [];
    for (const s of sel.filter((x) => String(x.group || "") === g.name)) {
      const c = g.choices.find((x) => x.name === String(s.name || ""));
      if (c) {
        const o = { group: g.name, name: c.name, price: Number(c.price) || 0 };
        if (Number(c.ingredient_id) > 0 && Number(c.qty) > 0) { o.ingredient_id = Number(c.ingredient_id); o.qty = Math.round(Number(c.qty) * 1000) / 1000; }
        if (!found.some((f) => f.name === o.name)) found.push(o);
      }
      else if (lenient) found.push(withConsumption(s));
      else throw bad(`"${s.name}" ya no está disponible en ${product.name}`);
    }
    if (!lenient) {
      if (g.required && !found.length) throw bad(`Elige ${g.name.toLowerCase()} para ${product.name}`);
      if (g.type === "single" && found.length > 1) throw bad(`Solo puedes elegir una opción de ${g.name.toLowerCase()} en ${product.name}`);
    }
    out.push(...found);
  }
  if (lenient) for (const s of sel) if (!groups.some((g) => g.name === String(s.group || ""))) out.push(withConsumption(s));
  return out;
}

const publicView = (o) => o && ({
  code: o.code, daily_number: o.daily_number, status: o.status, type: o.type, customer_name: o.customer_name,
  created_at: o.created_at, ready_at: o.ready_at, delivered_at: o.delivered_at, total: o.total, paid: o.paid,
  items: o.items.map((i) => ({ name: i.name, qty: i.qty, emoji: i.emoji, options: (Array.isArray(i.options) ? i.options : []).map((x) => x.name) })),
});

async function applyStock(order, direction, userId, at) {
  // direction: -1 consume, +1 restore
  const t = at || now();
  const lows = [];
  const reason = direction < 0 ? "venta" : "anulación";
  for (const it of order.items) {
    if (!it.product_id) continue;
    const p = await get("SELECT * FROM products WHERE id=?", it.product_id);
    if (!p) continue;
    if (p.track_stock) {
      const delta = direction * it.qty;
      await run("UPDATE products SET stock = stock + ? WHERE id=?", delta, p.id);
      await run("INSERT INTO stock_movements(item_type,item_id,qty,reason,order_id,user_id,created_at) VALUES('product',?,?,?,?,?,?)", p.id, delta, reason, order.id, userId, t);
      const np = await get("SELECT stock,min_stock,name FROM products WHERE id=?", p.id);
      if (direction < 0 && np.stock <= np.min_stock) lows.push({ type: "product", id: p.id, name: np.name, stock: np.stock });
    }
    const recipe = await all("SELECT pi.qty, i.* FROM product_ingredients pi JOIN ingredients i ON i.id=pi.ingredient_id WHERE pi.product_id=?", p.id);
    for (const ing of recipe) {
      const delta = direction * ing.qty * it.qty;
      await run("UPDATE ingredients SET stock = stock + ? WHERE id=?", delta, ing.id);
      await run("INSERT INTO stock_movements(item_type,item_id,qty,reason,order_id,user_id,created_at) VALUES('ingredient',?,?,?,?,?,?)", ing.id, delta, reason, order.id, userId, t);
      const ni = await get("SELECT stock,min_stock,name FROM ingredients WHERE id=?", ing.id);
      if (direction < 0 && ni.stock <= ni.min_stock) lows.push({ type: "ingredient", id: ing.id, name: ni.name, stock: ni.stock });
    }
    // Adicionales / sabores con consumo de inventario: cada opción elegida descuenta su insumo (como la receta).
    for (const o of Array.isArray(it.options) ? it.options : []) {
      const oing = o && Number(o.ingredient_id) > 0 ? await get("SELECT * FROM ingredients WHERE id=?", Number(o.ingredient_id)) : null;
      if (!oing) continue;
      const qty = Number(o.qty) || 0;
      if (qty <= 0) continue;
      const delta = direction * qty * it.qty;
      await run("UPDATE ingredients SET stock = stock + ? WHERE id=?", delta, oing.id);
      await run("INSERT INTO stock_movements(item_type,item_id,qty,reason,order_id,user_id,created_at) VALUES('ingredient',?,?,?,?,?,?)", oing.id, delta, reason, order.id, userId, t);
      if (direction < 0 && oing.stock + delta <= oing.min_stock) lows.push({ type: "ingredient", id: oing.id, name: oing.name, stock: oing.stock + delta });
    }
  }
  if (lows.length) emit("stock:low", lows);
}

async function networkPrint(order, settings, kitchen) {
  if (settings.printer_mode !== "network") return;
  try {
    await sendToPrinter(settings.printer_host, settings.printer_port, receiptBuffer(order, settings, { kitchen }));
  } catch (e) {
    console.error("Impresora:", e.message);
  }
}

const openSession = () => get("SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1");

export default function ordersRoutes() {
  const r = Router();

  // Public: track by code
  r.get("/track/:code", async (req, res) => {
    const o = await get("SELECT id FROM orders WHERE code=?", req.params.code.toUpperCase());
    if (!o) return res.status(404).json({ error: "Pedido no encontrado" });
    res.json(publicView(await loadOrder(o.id)));
  });

  // Public: board for the customer display (today's active orders)
  r.get("/board", async (_req, res) => {
    const rows = await loadOrders("WHERE o.created_at >= ? AND o.status IN ('pending','preparing','ready')", [localDayStart()]);
    res.json(rows.map(publicView));
  });

  r.use(requireAuth, requireRole("admin", "cajero", "cocina", "mesero"));

  r.get("/", async (req, res) => {
    const { status, date, active } = req.query;
    const conds = [], params = [];
    if (req.user.role === "mesero") { conds.push("o.user_id=?"); params.push(req.user.id); }
    if (status) { conds.push(`o.status IN (${status.split(",").map(() => "?").join(",")})`); params.push(...status.split(",")); }
    if (active) conds.push("o.status IN ('pending','preparing','ready')");
    if (date) {
      const start = new Date(date + "T00:00:00"); const end = new Date(start); end.setDate(end.getDate() + 1);
      conds.push("o.created_at >= ? AND o.created_at < ?"); params.push(start.toISOString(), end.toISOString());
    } else if (!active) {
      conds.push("o.created_at >= ?"); params.push(localDayStart());
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json(await loadOrders(conds.length ? "WHERE " + conds.join(" AND ") : "", params, { limit, offset }));
  });

  r.get("/:id", async (req, res) => {
    const o = await loadOrder(req.params.id);
    if (o && req.user.role === "mesero" && o.user_id !== req.user.id) return res.status(403).json({ error: "Sin permisos" });
    o ? res.json(o) : res.status(404).json({ error: "No existe" });
  });

  r.post("/", async (req, res) => {
    const b = req.body;
    const settings = await getSettings();
    if (!["admin", "cajero", "mesero"].includes(req.user.role)) return res.status(403).json({ error: "Sin permisos" });
    // Idempotent: the same operation sent twice (retry after a lost response, offline replay) returns the existing order.
    const cid = clientId(b.client_id);
    if (cid) { const dup = await loadOrder("c_" + cid); if (dup) return res.json(dup); }
    // Offline replay: the sale already happened on the device, so it is recorded even if the register is now closed or stock ran out.
    const replay = !!(cid && b.offline);
    const replayUserId = id(b.user_id);
    const mayReplayAsUser = replay && replayUserId && (req.user.role === "admin" || replayUserId === req.user.id);
    const creator = mayReplayAsUser ? await get("SELECT id,role FROM users WHERE id=?", replayUserId) : req.user;
    const waiterOrder = creator?.role === "mesero";
    const t = replay ? clientTime(b.created_at) : now();
    const session = waiterOrder ? null : (replay ? await sessionAt(t) : await openSession());
    if (!waiterOrder && !session && !replay) return res.status(409).json({ error: "La caja está cerrada. Abre la caja para poder vender." });
    if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: "El pedido está vacío" });
    if (!["takeaway", "delivery", "dinein"].includes(b.type)) return res.status(400).json({ error: "Tipo de pedido inválido" });
    const custErr = customerError(b.type, b);
    if (custErr && !replay) return res.status(400).json({ error: custErr });

    const items = [];
    for (const it of b.items) {
      const p = await get("SELECT * FROM products WHERE id=?", id(it.product_id));
      if (!p || (!p.active && !replay)) throw Object.assign(new Error("Producto no disponible"), { status: 400 });
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      if (!replay && p.track_stock && p.stock < qty) throw Object.assign(new Error(`Stock insuficiente de ${p.name} (quedan ${p.stock})`), { status: 400 });
      // Sabores / adicionales chosen at the register; the unit price includes their extras.
      const options = pickOptions(p, it.options, replay);
      const extras = options.reduce((s, c) => s + c.price, 0);
      // Offline devices sell at the price they saw; online the catalogue is authoritative.
      const price = replay && Number.isFinite(Number(it.price)) ? Number(it.price) : +(p.price + extras).toFixed(2);
      items.push({ product_id: p.id, name: p.name, emoji: p.emoji, price, qty, notes: String(it.notes || ""), options });
    }
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = waiterOrder ? 0 : Math.min(subtotal, Math.max(0, Number(b.discount || 0)));
    const tax = +(((subtotal - discount) * (Number(settings.tax_rate) || 0)) / 100).toFixed(2);
    const total = +(subtotal - discount + tax).toFixed(2);
    const paid = !waiterOrder && !!b.payment_method;

    const orderId = await transaction(async () => {
      const day = localDayBounds(t);
      // Keep the number/code the device printed on the ticket when they are still free; otherwise assign the next one.
      const wanted = Number(b.daily_number) || 0;
      const taken = wanted ? await get("SELECT 1 FROM orders WHERE daily_number=? AND created_at >= ? AND created_at < ?", wanted, day.start, day.end) : true;
      const daily = replay && wanted && !taken ? wanted : ((await get("SELECT COALESCE(MAX(daily_number),0) AS m FROM orders WHERE created_at >= ? AND created_at < ?", day.start, day.end)).m || 0) + 1;
      const codeOk = replay && typeof b.code === "string" && /^[A-Z0-9]{1,4}-[A-Z0-9]{5}$/.test(b.code) && !(await get("SELECT 1 FROM orders WHERE code=?", b.code));
      const x = await run(
        `INSERT INTO orders(code,daily_number,type,customer_name,customer_phone,table_no,customer_address,customer_reference,status,payment_method,paid,subtotal,discount,tax,total,cash_received,notes,user_id,cash_session_id,created_at,updated_at,paid_at,client_id,offline)
         VALUES(?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        codeOk ? b.code : await genCode(settings.order_prefix || "G"), daily, b.type, String(b.customer_name || "").trim(), String(b.customer_phone || "").trim(), String(b.table_no || "").trim(),
        b.type === "delivery" ? String(b.customer_address || "").trim() : "", b.type === "delivery" ? String(b.customer_reference || "").trim() : "",
        paid ? b.payment_method : null, paid ? 1 : 0, subtotal, discount, tax, total,
        paid && b.payment_method === "cash" && b.cash_received != null ? Number(b.cash_received) : null,
        String(b.notes || ""), creator?.id || req.user.id, session ? session.id : null, t, t, paid ? t : null, cid, replay ? 1 : 0,
      );
      const oid = x.lastInsertRowid;
      for (const it of items)
        await run("INSERT INTO order_items(order_id,product_id,name,emoji,price,qty,notes,options) VALUES(?,?,?,?,?,?,?,?)", oid, it.product_id, it.name, it.emoji, it.price, it.qty, it.notes, JSON.stringify(it.options));
      await applyStock(await loadOrder(oid), -1, req.user.id, t);
      return oid;
    });
    const order = await loadOrder(orderId);
    emit("order:created", order);
    if (settings.auto_print && !replay) {
      if (!waiterOrder) networkPrint(order, settings, false);
      networkPrint(order, settings, true);
    }
    res.json(order);
  });

  // Cashier/admin collects an unpaid ready order and hands it over atomically.
  r.post("/:id/checkout", async (req, res) => {
    if (!["admin", "cajero"].includes(req.user.role)) return res.status(403).json({ error: "Solo caja o administración puede cobrar y entregar" });
    const o = await loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "No existe" });
    if (o.status !== "ready") return res.status(400).json({ error: "El pedido aún no está listo" });
    if (o.paid) return res.status(400).json({ error: "El pedido ya está pagado" });
    const customerName = String(req.body.customer_name || "").trim();
    const { payment_method } = req.body;
    const cashReceived = Number(req.body.cash_received);
    if (!customerName) return res.status(400).json({ error: "Indica el nombre del cliente" });
    if (!["cash", "card", "qr"].includes(payment_method)) return res.status(400).json({ error: "Método inválido" });
    if (payment_method === "cash" && (!Number.isFinite(cashReceived) || cashReceived < o.total)) return res.status(400).json({ error: "El monto recibido es menor al total" });
    const session = await openSession();
    if (!session) return res.status(409).json({ error: "La caja está cerrada. Abre la caja para cobrar." });
    const t = now();
    await transaction(async () => {
      const result = await run(
        "UPDATE orders SET customer_name=?, payment_method=?, paid=1, paid_at=?, cash_received=?, cash_session_id=?, status='delivered', delivered_at=?, updated_at=? WHERE id=? AND paid=0 AND status='ready'",
        customerName, payment_method, t, payment_method === "cash" ? cashReceived : null, session.id, t, t, o.id,
      );
      if (!result.changes) throw Object.assign(new Error("El pedido ya fue procesado"), { status: 409 });
    });
    const order = await loadOrder(o.id);
    emit("order:updated", order);
    await networkPrint(order, await getSettings(), false);
    res.json(order);
  });

  r.post("/:id/pay", async (req, res) => {
    if (!["admin", "cajero"].includes(req.user.role)) return res.status(403).json({ error: "Sin permisos" });
    const o = await loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "No existe" });
    const { payment_method, cash_received } = req.body;
    const replay = !!(clientId(req.body.op_id) && req.body.offline); // replay from the sync queue → idempotent + lenient
    if (o.paid) return replay ? res.json(o) : res.status(400).json({ error: "El pedido ya está pagado" });
    if (!["cash", "card", "qr"].includes(payment_method)) return res.status(400).json({ error: "Método inválido" });
    const t = replay ? clientTime(req.body.at) : now();
    const session = replay ? await sessionAt(t) : await openSession();
    if (!session && !replay) return res.status(409).json({ error: "La caja está cerrada. Abre la caja para cobrar." });
    await run("UPDATE orders SET payment_method=?, paid=1, paid_at=?, cash_received=?, updated_at=?, cash_session_id=COALESCE(cash_session_id, ?) WHERE id=?",
      payment_method, t, payment_method === "cash" && cash_received != null ? Number(cash_received) : null, t, session ? session.id : null, o.id);
    const order = await loadOrder(o.id);
    emit("order:updated", order);
    res.json(order);
  });

  r.patch("/:id/status", async (req, res) => {
    const o = await loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "No existe" });
    const { status } = req.body;
    if (!["pending", "preparing", "ready", "delivered", "cancelled", "refunded"].includes(status)) return res.status(400).json({ error: "Estado inválido" });
    if (req.user.role === "mesero") return res.status(403).json({ error: "El mesero solo puede crear pedidos" });
    if (status === "delivered" && !o.paid) return res.status(400).json({ error: "Cobra el pedido antes de entregarlo" });
    // Who may move an order: cocina drives the kitchen flow, cajero only hands it over, admin does everything.
    if (req.user.role === "cajero" && status !== "delivered") return res.status(403).json({ error: "El cajero solo puede marcar el pedido como entregado" });
    if (req.user.role === "cocina" && ["delivered", "cancelled"].includes(status)) return res.status(403).json({ error: "Sin permisos" });
    if (status === "delivered" && o.status !== "ready") return res.status(400).json({ error: "El pedido aún no está listo" });
    const replay = !!(clientId(req.body.op_id) && req.body.offline);
    if (o.status === status) return res.json(o); // idempotent (retry / offline replay)
    if (o.status === "cancelled" || o.status === "refunded") return replay ? res.json(o) : res.status(400).json({ error: `El pedido ya fue ${o.status === "cancelled" ? "cancelado" : "devuelto"}` });
    const t = replay ? clientTime(req.body.at) : now();
    if (status === "cancelled") {
      if (req.user.role !== "admin") return res.status(403).json({ error: "Solo un administrador puede cancelar pedidos" });
      await transaction(() => applyStock(o, +1, req.user.id, t));
    }
    await run("UPDATE orders SET status=?, updated_at=?, ready_at=CASE WHEN ?::text='ready' THEN ? ELSE ready_at END, delivered_at=CASE WHEN ?::text='delivered' THEN ? ELSE delivered_at END WHERE id=?",
      status, t, status, t, status, t, o.id);
    const order = await loadOrder(o.id);
    emit("order:updated", order);
    res.json(order);
  });

  // ---- Refund: only admin can process a return on a paid order ----
  r.post("/:id/refund", async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Solo un administrador puede procesar devoluciones" });
    const o = await loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "No existe" });
    if (o.status === "refunded") return res.json(o); // idempotent
    if (!o.paid) return res.status(400).json({ error: "El pedido no está pagado, no se puede devolver" });
    if (o.status === "cancelled") return res.status(400).json({ error: "El pedido está cancelado" });
    const { refund_method } = req.body;
    if (!["cash", "card", "qr"].includes(refund_method)) return res.status(400).json({ error: "Indica el método de devolución" });
    const t = now();
    await transaction(async () => {
      await applyStock(o, +1, req.user.id, t); // restore stock
      await run("UPDATE orders SET status='refunded', refund_method=?, refund_amount=?, refunded_at=?, updated_at=? WHERE id=?",
        refund_method, o.total, t, t, o.id);
    });
    const order = await loadOrder(o.id);
    emit("order:updated", order);
    res.json(order);
  });

  // ---- Refund: only admin can process a return on a paid order ----
  r.post("/:id/refund", async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Solo un administrador puede procesar devoluciones" });
    const o = await loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "No existe" });
    if (o.status === "refunded") return res.json(o); // idempotent
    if (!o.paid) return res.status(400).json({ error: "El pedido no está pagado, no se puede devolver" });
    if (o.status === "cancelled") return res.status(400).json({ error: "El pedido está cancelado" });
    const { refund_method } = req.body;
    if (!["cash", "card", "qr"].includes(refund_method)) return res.status(400).json({ error: "Indica el método de devolución" });
    const t = now();
    await transaction(async () => {
      await applyStock(o, +1, req.user.id, t); // restore stock
      await run("UPDATE orders SET status='refunded', refund_method=?, refund_amount=?, refunded_at=?, updated_at=? WHERE id=?",
        refund_method, o.total, t, t, o.id);
    });
    const order = await loadOrder(o.id);
    emit("order:updated", order);
    res.json(order);
  });

  r.put("/:id", async (req, res) => {
    // Edit customer data / notes only
    const o = await loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "No existe" });
    if (!["admin", "cajero"].includes(req.user.role)) return res.status(403).json({ error: "Sin permisos" });
    const { customer_name = o.customer_name, table_no = o.table_no, notes = o.notes, customer_phone = o.customer_phone, customer_address = o.customer_address, customer_reference = o.customer_reference } = req.body;
    const custErr = customerError(o.type, { customer_name, table_no, customer_phone, customer_address, customer_reference });
    if (custErr) return res.status(400).json({ error: custErr });
    await run("UPDATE orders SET customer_name=?, table_no=?, notes=?, customer_phone=?, customer_address=?, customer_reference=?, updated_at=? WHERE id=?",
      String(customer_name).trim(), String(table_no).trim(), notes, String(customer_phone).trim(), String(customer_address).trim(), String(customer_reference).trim(), now(), o.id);
    const order = await loadOrder(o.id);
    emit("order:updated", order);
    res.json(order);
  });

  return r;
}
