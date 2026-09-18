import { Router } from "express";
import { get, all, run, now, clientTime, clientId } from "../db.js";
import { requireRole, authenticate } from "./auth.js";

export default function cashRoutes(io) {
const r = Router();
const staff = requireRole("admin", "cajero");

async function sessionSummary(s) {
  if (!s) return null;
  const end = s.closed_at || now();
  const byMethod = await all(`SELECT payment_method AS method, COUNT(*) AS n, COALESCE(SUM(total),0) AS t FROM orders
     WHERE status<>'cancelled' AND paid=1 AND cash_session_id=? GROUP BY payment_method`, s.id);
  const totals = { cash: 0, card: 0, qr: 0, orders: 0, revenue: 0 };
  for (const m of byMethod) { totals[m.method] = m.t; totals.orders += m.n; totals.revenue += m.t; }
  const cancelled = (await get("SELECT COUNT(*) AS n FROM orders WHERE status='cancelled' AND cash_session_id=?", s.id)).n;
  const user = await get("SELECT name FROM users WHERE id=?", s.user_id);
  return { ...s, offline: !!s.offline, user_name: user?.name, totals, cancelled, expected_cash: s.opening_amount + totals.cash, end };
}
const openSession = () => get("SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1");
const byClientId = (cid) => get("SELECT * FROM cash_sessions WHERE client_id=?", cid);

r.get("/current", async (_req, res) => {
  res.json(await sessionSummary(await openSession()));
});

r.get("/history", staff, async (_req, res) => {
  const rows = await all("SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 30");
  res.json(await Promise.all(rows.map(sessionSummary)));
});

/**
 * Open the register. Online: the cashier identifies with email + password.
 * Offline replay ({client_id, offline:true, user_id, opened_at}): the device already verified the cashier's password
 * against its local copy, so the session is created in that user's name; sending it twice returns the same session.
 */
r.post("/open", staff, async (req, res) => {
  const b = req.body || {};
  const cid = clientId(b.client_id);
  if (cid) { const dup = await byClientId(cid); if (dup) return res.json(await sessionSummary(dup)); }
  if (await openSession()) return res.status(400).json({ error: "Ya hay una caja abierta" });
  const { email, password, opening_amount } = b;
  let cashier;
  if (cid && b.offline) {
    cashier = await get("SELECT * FROM users WHERE id=? AND active=1", Number(b.user_id) || 0);
    if (!cashier) return res.status(400).json({ error: "El cajero de la apertura ya no existe" });
  } else {
    if (!email || !password) return res.status(400).json({ error: "Ingresa tu correo y contraseña para abrir la caja" });
    cashier = await authenticate(email, password);
    if (!cashier) return res.status(401).json({ error: "Correo o contraseña incorrectos" });
  }
  if (!["admin", "cajero"].includes(cashier.role)) return res.status(403).json({ error: "Ese usuario no puede operar la caja" });
  if (opening_amount == null || opening_amount === "" || !Number.isFinite(Number(opening_amount)) || Number(opening_amount) < 0) return res.status(400).json({ error: "Registra el monto inicial de la caja" });
  const t = cid && b.offline ? clientTime(b.opened_at) : now();
  const x = await run("INSERT INTO cash_sessions(user_id,opening_amount,notes,opened_at,client_id,offline) VALUES(?,?,?,?,?,?)", cashier.id, Number(opening_amount), String(b.notes || ""), t, cid, cid && b.offline ? 1 : 0);
  // Orders that were recorded offline while this session was open on the device get attached to it now.
  await run("UPDATE orders SET cash_session_id=? WHERE cash_session_id IS NULL AND created_at >= ?", x.lastInsertRowid, t);
  const s = await sessionSummary(await get("SELECT * FROM cash_sessions WHERE id=?", x.lastInsertRowid));
  io.emit("cash:updated", s);
  res.json(s);
});

/**
 * Close the register. Online closes the open session. Offline replay may target the session by client_id / session_id and
 * carries the real closing time; closing an already-closed session (or one that never reached the server) is a no-op.
 */
r.post("/close", staff, async (req, res) => {
  const b = req.body || {};
  const replay = !!clientId(b.op_id);
  let s;
  if (replay && (b.session_client_id || b.session_id)) {
    s = b.session_client_id ? await byClientId(String(b.session_client_id)) : await get("SELECT * FROM cash_sessions WHERE id=?", Number(b.session_id) || 0);
    if (!s) return res.json(null); // the offline opening never synced (e.g. another register was open) → nothing to close
    if (s.closed_at) return res.json(await sessionSummary(s));
  } else {
    s = await openSession();
    if (!s) return replay ? res.json(null) : res.status(400).json({ error: "No hay caja abierta" });
  }
  if (req.user.role !== "admin" && s.user_id !== req.user.id && !replay) return res.status(403).json({ error: "Solo el cajero que abrió la caja (o un administrador) puede cerrarla" });
  const sum = await sessionSummary(s);
  await run("UPDATE cash_sessions SET closing_amount=?, expected_amount=?, notes=?, closed_at=? WHERE id=?",
    Number(b.closing_amount || 0), sum.expected_cash, String(b.notes || s.notes), replay ? clientTime(b.at) : now(), s.id);
  if (!(await openSession())) io.emit("cash:updated", null);
  res.json(await sessionSummary(await get("SELECT * FROM cash_sessions WHERE id=?", s.id)));
});

return r;
}
