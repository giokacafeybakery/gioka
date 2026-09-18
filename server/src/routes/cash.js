import { Router } from "express";
import { get, all, run, now } from "../db.js";
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
  return { ...s, user_name: user?.name, totals, cancelled, expected_cash: s.opening_amount + totals.cash, end };
}
const openSession = () => get("SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1");

r.get("/current", async (_req, res) => {
  res.json(await sessionSummary(await openSession()));
});

r.get("/history", staff, async (_req, res) => {
  const rows = await all("SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 30");
  res.json(await Promise.all(rows.map(sessionSummary)));
});

r.post("/open", staff, async (req, res) => {
  if (await openSession()) return res.status(400).json({ error: "Ya hay una caja abierta" });
  const { email, password, opening_amount } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Ingresa tu correo y contraseña para abrir la caja" });
  const cashier = await authenticate(email, password);
  if (!cashier) return res.status(401).json({ error: "Correo o contraseña incorrectos" });
  if (!["admin", "cajero"].includes(cashier.role)) return res.status(403).json({ error: "Ese usuario no puede operar la caja" });
  if (opening_amount == null || opening_amount === "" || !Number.isFinite(Number(opening_amount)) || Number(opening_amount) < 0) return res.status(400).json({ error: "Registra el monto inicial de la caja" });
  const x = await run("INSERT INTO cash_sessions(user_id,opening_amount,notes,opened_at) VALUES(?,?,?,?)", cashier.id, Number(opening_amount), String(req.body.notes || ""), now());
  const s = await sessionSummary(await get("SELECT * FROM cash_sessions WHERE id=?", x.lastInsertRowid));
  io.emit("cash:updated", s);
  res.json(s);
});

r.post("/close", staff, async (req, res) => {
  const s = await openSession();
  if (!s) return res.status(400).json({ error: "No hay caja abierta" });
  if (req.user.role !== "admin" && s.user_id !== req.user.id) return res.status(403).json({ error: "Solo el cajero que abrió la caja (o un administrador) puede cerrarla" });
  const sum = await sessionSummary(s);
  await run("UPDATE cash_sessions SET closing_amount=?, expected_amount=?, notes=?, closed_at=? WHERE id=?",
    Number(req.body.closing_amount || 0), sum.expected_cash, String(req.body.notes || s.notes), now(), s.id);
  io.emit("cash:updated", null);
  res.json(await sessionSummary(await get("SELECT * FROM cash_sessions WHERE id=?", s.id)));
});

return r;
}
