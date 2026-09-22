import { Router } from "express";
import { get, all, run, hashPassword, verifyPassword, newToken, now } from "../db.js";
import { rateLimit } from "../rateLimit.js";

export const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: "No autorizado" });

export const requireRole = (...roles) => (req, res, next) =>
  req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Sin permisos" });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["admin", "cajero", "cocina", "inventario", "mesero"];
const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active, created_at: u.created_at });
const byEmail = (email) => get("SELECT * FROM users WHERE lower(email)=lower(?)", String(email || "").trim());

/** Verify email + password. Returns the user row or null. */
export async function authenticate(email, password) {
  const u = await byEmail(email);
  if (!u || !u.active || !verifyPassword(String(password || ""), u.password_hash)) return null;
  return u;
}

const r = Router();
const loginLimiter = rateLimit({ windowMs: 60_000, max: 5, message: "Demasiados intentos de inicio de sesión. Espera un minuto." });

r.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Ingresa tu correo y contraseña" });
  const user = await authenticate(email, password);
  if (!user) return res.status(401).json({ error: "Correo o contraseña incorrectos" });
  const token = newToken();
  const t = now();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  await run("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)", token, user.id, t, expiresAt);
  res.json({ token, user: publicUser(user) });
});

r.get("/me", requireAuth, async (req, res) => res.json(publicUser(await get("SELECT * FROM users WHERE id=?", req.user.id))));

r.post("/logout", requireAuth, async (req, res) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  await run("DELETE FROM sessions WHERE token=?", token);
  res.json({ ok: true });
});

// ---- user management (admin only) ----
r.get("/users", requireAuth, requireRole("admin"), async (_req, res) => {
  res.json((await all("SELECT * FROM users ORDER BY id")).map(publicUser));
});

r.post("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !ROLES.includes(role)) return res.status(400).json({ error: "Datos inválidos" });
  if (!EMAIL_RE.test(String(email || ""))) return res.status(400).json({ error: "Correo inválido" });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  if (await byEmail(email)) return res.status(400).json({ error: "Ese correo ya está registrado" });
  const x = await run("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)", name.trim(), email.trim(), hashPassword(password), role, now());
  res.json(publicUser(await get("SELECT * FROM users WHERE id=?", x.lastInsertRowid)));
});

r.put("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, email, password, role, active } = req.body || {};
  const u = await get("SELECT * FROM users WHERE id=?", Number(req.params.id) || 0);
  if (!u) return res.status(404).json({ error: "No existe" });
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: "Rol inválido" });
  if (email !== undefined) {
    if (!EMAIL_RE.test(String(email))) return res.status(400).json({ error: "Correo inválido" });
    const other = await byEmail(email);
    if (other && other.id !== u.id) return res.status(400).json({ error: "Ese correo ya está registrado" });
  }
  if (password && String(password).length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  if (u.id === req.user.id && (role && role !== "admin" || active === false)) return res.status(400).json({ error: "No puedes quitarte tu propio acceso de administrador" });
  await run(
    "UPDATE users SET name=?, email=?, role=?, active=?, password_hash=? WHERE id=?",
    name ?? u.name, email !== undefined ? email.trim() : u.email, role ?? u.role, active == null ? u.active : (active ? 1 : 0), password ? hashPassword(password) : u.password_hash, u.id,
  );
  if (password || active === false) await run("DELETE FROM sessions WHERE user_id=? AND token<>?", u.id, (req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  res.json(publicUser(await get("SELECT * FROM users WHERE id=?", u.id)));
});

r.delete("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id) || 0;
  if (id === req.user.id) return res.status(400).json({ error: "No puedes desactivarte a ti mismo" });
  await run("UPDATE users SET active=0 WHERE id=?", id);
  await run("DELETE FROM sessions WHERE user_id=?", id);
  res.json({ ok: true });
});

export default r;
