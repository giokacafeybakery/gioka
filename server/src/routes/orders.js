import { Router } from "express";
import { db, get, all, run, now, getSettings } from "../db.js";
import { requireAuth } from "./auth.js";
import { receiptBuffer, sendToPrinter } from "../escpos.js";

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = (prefix) => {
  let c;
  do {
    c = prefix + "-" + Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join("");
  } while (get("SELECT 1 FROM orders WHERE code=?", c));
  return c;
};
const todayPrefix = () => new Date().toISOString().slice(0, 10);
const localDayStart = () => {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
};

export function loadOrder(id) {
  const o = get("SELECT o.*, u.name AS user_name FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.id=?", id);
  if (!o) return null;
  o.items = all("SELECT * FROM order_items WHERE order_id=? ORDER BY id", id);
  o.paid = !!o.paid;
  return o;
}
export function loadOrders(where = "", ...params) {
  const rows = all(`SELECT o.*, u.name AS user_name FROM orders o LEFT JOIN users u ON u.id=o.user_id ${where} ORDER BY o.created_at DESC`, ...params);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const items = all(`SELECT * FROM order_items WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ...ids);
  const byOrder = {};
  for (const it of items) (byOrder[it.order_id] ||= []).push(it);
  return rows.map((r) => ({ ...r, paid: !!r.paid, items: byOrder[r.id] || [] }));
}

const publicView = (o) => o && ({
  code: o.code, daily_number: o.daily_number, status: o.status, type: o.type, customer_name: o.customer_name,
  created_at: o.created_at, ready_at: o.ready_at, delivered_at: o.delivered_at, total: o.total, paid: o.paid,
  items: o.items.map((i) => ({ name: i.name, qty: i.qty, emoji: i.emoji })),
});

function applyStock(order, direction, userId, io) {
  // direction: -1 consume, +1 restore
  const t = now();
  const lows = [];
  for (const it of order.items) {
    if (!it.product_id) continue;
    const p = get("SELECT * FROM products WHERE id=?", it.product_id);
    if (!p) continue;
    if (p.track_stock) {
      const delta = direction * it.qty;
      run("UPDATE products SET stock = stock + ? WHERE id=?", delta, p.id);
      run("INSERT INTO stock_movements(item_type,item_id,qty,reason,order_id,user_id,created_at) VALUES('product',?,?,?,?,?,?)",
        p.id, delta, direction < 0 ? "venta" : "anulación", order.id, userId, t);
      const np = get("SELECT stock,min_stock,name FROM products WHERE id=?", p.id);
      if (direction < 0 && np.stock <= np.min_stock) lows.push({ type: "product", id: p.id, name: np.name, stock: np.stock });
    }
    const recipe = all("SELECT pi.qty, i.* FROM product_ingredients pi JOIN ingredients i ON i.id=pi.ingredient_id WHERE pi.product_id=?", p.id);
    for (const ing of recipe) {
      const delta = direction * ing.qty * it.qty;
      run("UPDATE ingredients SET stock = stock + ? WHERE id=?", delta, ing.id);
      run("INSERT INTO stock_movements(item_type,item_id,qty,reason,order_id,user_id,created_at) VALUES('ingredient',?,?,?,?,?,?)",
        ing.id, delta, direction < 0 ? "venta" : "anulación", order.id, userId, t);
      const ni = get("SELECT stock,min_stock,name FROM ingredients WHERE id=?", ing.id);
      if (direction < 0 && ni.stock <= ni.min_stock) lows.push({ type: "ingredient", id: ing.id, name: ni.name, stock: ni.stock });
    }
  }
  if (lows.length) io.emit("stock:low", lows);
}

async function networkPrint(order, settings, kitchen) {
  if (settings.printer_mode !== "network") return;
  try {
    await sendToPrinter(settings.printer_host, settings.printer_port, receiptBuffer(order, settings, { kitchen }));
  } catch (e) {
    console.error("Impresora:", e.message);
  }
}

export default function ordersRoutes(io) {
  const r = Router();

  // Public: track by code
  r.get("/track/:code", (req, res) => {
    const o = get("SELECT id FROM orders WHERE code=?", req.params.code.toUpperCase());
    if (!o) return res.status(404).json({ error: "Pedido no encontrado" });
    res.json(publicView(loadOrder(o.id)));
  });

  // Public: board for the customer display (today's active orders)
  r.get("/board", (_req, res) => {
    const rows = loadOrders("WHERE o.created_at >= ? AND o.status IN ('pending','preparing','ready')", localDayStart());
    res.json(rows.map(publicView));
  });

  r.use(requireAuth);

  r.get("/", (req, res) => {
    const { status, date, active } = req.query;
    const conds = [], params = [];
    if (status) { conds.push(`o.status IN (${status.split(",").map(() => "?").join(",")})`); params.push(...status.split(",")); }
    if (active) conds.push("o.status IN ('pending','preparing','ready')");
    if (date) {
      const start = new Date(date + "T00:00:00"); const end = new Date(start); end.setDate(end.getDate() + 1);
      conds.push("o.created_at >= ? AND o.created_at < ?"); params.push(start.toISOString(), end.toISOString());
    } else if (!active) {
      conds.push("o.created_at >= ?"); params.push(localDayStart());
    }
    res.json(loadOrders(conds.length ? "WHERE " + conds.join(" AND ") : "", ...params));
  });

  r.get("/:id", (req, res) => {
    const o = loadOrder(req.params.id);
    o ? res.json(o) : res.status(404).json({ error: "No existe" });
  });

  r.post("/", async (req, res) => {
    const b = req.body;
    const settings = getSettings();
    if (!["admin", "cajero"].includes(req.user.role)) return res.status(403).json({ error: "Sin permisos" });
    const openSession = get("SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1");
    if (!openSession) return res.status(409).json({ error: "La caja está cerrada. Abre la caja para poder vender." });
    if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: "El pedido está vacío" });
    if (!["takeaway", "delivery", "dinein"].includes(b.type)) return res.status(400).json({ error: "Tipo de pedido inválido" });

    const items = b.items.map((it) => {
      const p = get("SELECT * FROM products WHERE id=? AND active=1", it.product_id);
      if (!p) throw Object.assign(new Error("Producto no disponible"), { status: 400 });
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      if (p.track_stock && p.stock < qty) throw Object.assign(new Error(`Stock insuficiente de ${p.name} (quedan ${p.stock})`), { status: 400 });
      return { product_id: p.id, name: p.name, emoji: p.emoji, price: p.price, qty, notes: String(it.notes || "") };
    });
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = Math.min(subtotal, Math.max(0, Number(b.discount || 0)));
    const tax = +(((subtotal - discount) * (Number(settings.tax_rate) || 0)) / 100).toFixed(2);
    const total = +(subtotal - discount + tax).toFixed(2);
    const paid = !!b.payment_method;
    const t = now();
    const daily = (get("SELECT COALESCE(MAX(daily_number),0) m FROM orders WHERE created_at >= ?", localDayStart()).m || 0) + 1;
    const session = openSession;

    let id;
    db.exec("BEGIN");
    try {
      const x = run(
        `INSERT INTO orders(code,daily_number,type,customer_name,customer_phone,table_no,status,payment_method,paid,subtotal,discount,tax,total,cash_received,notes,user_id,cash_session_id,created_at,updated_at,paid_at)
         VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        genCode(settings.order_prefix || "G"), daily, b.type, String(b.customer_name || "").trim(), String(b.customer_phone || "").trim(), String(b.table_no || ""),
        b.payment_method || null, paid ? 1 : 0, subtotal, discount, tax, total,
        b.payment_method === "cash" && b.cash_received != null ? Number(b.cash_received) : null,
        String(b.notes || ""), req.user.id, session?.id || null, t, t, paid ? t : null,
      );
      id = x.lastInsertRowid;
      const ins = db.prepare("INSERT INTO order_items(order_id,product_id,name,emoji,price,qty,notes) VALUES(?,?,?,?,?,?,?)");
      for (const it of items) ins.run(id, it.product_id, it.name, it.emoji, it.price, it.qty, it.notes);
      const order = loadOrder(id);
      applyStock(order, -1, req.user.id, io);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    const order = loadOrder(id);
    io.emit("order:created", order);
    if (settings.auto_print) { networkPrint(order, settings, false); networkPrint(order, settings, true); }
    res.json(order);
  });

  r.post("/:id/pay", (req, res) => {
    if (!["admin", "cajero"].includes(req.user.role)) return res.status(403).json({ error: "Sin permisos" });
    const o = loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "No existe" });
    if (o.paid) return res.status(400).json({ error: "El pedido ya está pagado" });
    const session = get("SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1");
    if (!session) return res.status(409).json({ error: "La caja está cerrada. Abre la caja para cobrar." });
    const { payment_method, cash_received } = req.body;
    if (!["cash", "card", "qr"].includes(payment_method)) return res.status(400).json({ error: "Método inválido" });
    run("UPDATE orders SET payment_method=?, paid=1, paid_at=?, cash_received=?, updated_at=?, cash_session_id=COALESCE(cash_session_id, ?) WHERE id=?",
      payment_method, now(), payment_method === "cash" && cash_received != null ? Number(cash_received) : null, now(), session.id, o.id);
    const order = loadOrder(o.id);
    io.emit("order:updated", order);
    res.json(order);
  });

  r.patch("/:id/status", (req, res) => {
    const o = loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "No existe" });
    const { status } = req.body;
    if (!["pending", "preparing", "ready", "delivered", "cancelled"].includes(status)) return res.status(400).json({ error: "Estado inválido" });
    if (o.status === "cancelled") return res.status(400).json({ error: "El pedido ya fue cancelado" });
    const t = now();
    if (status === "cancelled") {
      if (req.user.role === "cocina") return res.status(403).json({ error: "Sin permisos" });
      applyStock(o, +1, req.user.id, io);
    }
    run("UPDATE orders SET status=?, updated_at=?, ready_at=CASE WHEN ?='ready' THEN ? ELSE ready_at END, delivered_at=CASE WHEN ?='delivered' THEN ? ELSE delivered_at END WHERE id=?",
      status, t, status, t, status, t, o.id);
    const order = loadOrder(o.id);
    io.emit("order:updated", order);
    res.json(order);
  });

  r.put("/:id", (req, res) => {
    // Edit customer data / notes only
    const o = loadOrder(req.params.id);
    if (!o) return res.status(404).json({ error: "No existe" });
    const { customer_name = o.customer_name, table_no = o.table_no, notes = o.notes, customer_phone = o.customer_phone } = req.body;
    run("UPDATE orders SET customer_name=?, table_no=?, notes=?, customer_phone=?, updated_at=? WHERE id=?", customer_name, table_no, notes, customer_phone, now(), o.id);
    const order = loadOrder(o.id);
    io.emit("order:updated", order);
    res.json(order);
  });

  return r;
}
