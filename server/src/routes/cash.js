import { Router } from "express";
import { get, all, run, now } from "../db.js";
import { requireRole, authenticate } from "./auth.js";

export default function cashRoutes(io) {
const r = Router();
const staff = requireRole("admin", "cajero");

function sessionSummary(s) {
  if (!s) return null;
  const end = s.closed_at || now();
  const byMethod = all(`SELECT payment_method method, COUNT(*) n, COALESCE(SUM(total),0) t FROM orders
     WHERE status<>'cancelled' AND paid=1 AND cash_session_id=? GROUP BY payment_method`, s.id);
  const totals = { cash: 0, card: 0, qr: 0, orders: 0, revenue: 0 };
  for (const m of byMethod) { totals[m.method] = m.t; totals.orders += m.n; totals.revenue += m.t; }
  const cancelled = get("SELECT COUNT(*) n FROM orders WHERE status='cancelled' AND cash_session_id=?", s.id).n;
  const user = get("SELECT name FROM users WHERE id=?", s.user_id);
  return { ...s, user_name: user?.name, totals, cancelled, expected_cash: s.opening_amount + totals.cash, end };
}

r.get("/current", (_req, res) => {
  res.json(sessionSummary(get("SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1")));
});

r.get("/history", staff, (_req, res) => {
  res.json(all("SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 30").map(sessionSummary));
});

r.post("/open", staff, (req, res) => {
  if (get("SELECT 1 FROM cash_sessions WHERE closed_at IS NULL")) return res.status(400).json({ error: "Ya hay una caja abierta" });
  const { email, password, opening_amount } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Ingresa tu correo y contraseña para abrir la caja" });
  const cashier = authenticate(email, password);
  if (!cashier) return res.status(401).json({ error: "Correo o contraseña incorrectos" });
  if (!["admin", "cajero"].includes(cashier.role)) return res.status(403).json({ error: "Ese usuario no puede operar la caja" });
  if (opening_amount == null || opening_amount === "" || !Number.isFinite(Number(opening_amount)) || Number(opening_amount) < 0) return res.status(400).json({ error: "Registra el monto inicial de la caja" });
  const x = run("INSERT INTO cash_sessions(user_id,opening_amount,notes,opened_at) VALUES(?,?,?,?)", cashier.id, Number(opening_amount), String(req.body.notes || ""), now());
  const s = sessionSummary(get("SELECT * FROM cash_sessions WHERE id=?", x.lastInsertRowid));
  io.emit("cash:updated", s);
  res.json(s);
});

r.post("/close", staff, (req, res) => {
  const s = get("SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1");
  if (!s) return res.status(400).json({ error: "No hay caja abierta" });
  if (req.user.role !== "admin" && s.user_id !== req.user.id) return res.status(403).json({ error: "Solo el cajero que abrió la caja (o un administrador) puede cerrarla" });
  const sum = sessionSummary(s);
  run("UPDATE cash_sessions SET closing_amount=?, expected_amount=?, notes=?, closed_at=? WHERE id=?",
    Number(req.body.closing_amount || 0), sum.expected_cash, String(req.body.notes || s.notes), now(), s.id);
  io.emit("cash:updated", null);
  res.json(sessionSummary(get("SELECT * FROM cash_sessions WHERE id=?", s.id)));
});

return r;
}
