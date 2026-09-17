import { Router } from "express";
import { get, all, run, hashPassword, verifyPassword, newToken, now } from "../db.js";

export const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: "No autorizado" });

export const requireRole = (...roles) => (req, res, next) =>
  req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Sin permisos" });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active, created_at: u.created_at });

/** Verify email + password. Returns the user row or null. */
export function authenticate(email, password) {
  const u = get("SELECT * FROM users WHERE email=? AND active=1", String(email || "").trim());
  if (!u || !verifyPassword(String(password || ""), u.password_hash)) return null;
  return u;
}

const r = Router();

r.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Ingresa tu correo y contraseña" });
  const user = authenticate(email, password);
  if (!user) return res.status(401).json({ error: "Correo o contraseña incorrectos" });
  const token = newToken();
  run("INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)", token, user.id, now());
  res.json({ token, user: publicUser(user) });
});

r.get("/me", requireAuth, (req, res) => res.json(publicUser(get("SELECT * FROM users WHERE id=?", req.user.id))));

r.post("/logout", requireAuth, (req, res) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  run("DELETE FROM sessions WHERE token=?", token);
  res.json({ ok: true });
});

// ---- user management (admin only) ----
r.get("/users", requireAuth, requireRole("admin"), (_req, res) => {
  res.json(all("SELECT * FROM users ORDER BY id").map(publicUser));
});

r.post("/users", requireAuth, requireRole("admin"), (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !["admin", "cajero", "cocina", "inventario"].includes(role)) return res.status(400).json({ error: "Datos inválidos" });
  if (!EMAIL_RE.test(String(email || ""))) return res.status(400).json({ error: "Correo inválido" });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  if (get("SELECT 1 FROM users WHERE email=?", email.trim())) return res.status(400).json({ error: "Ese correo ya está registrado" });
  const x = run("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)", name.trim(), email.trim(), hashPassword(password), role, now());
  res.json(publicUser(get("SELECT * FROM users WHERE id=?", x.lastInsertRowid)));
});

r.put("/users/:id", requireAuth, requireRole("admin"), (req, res) => {
  const { name, email, password, role, active } = req.body || {};
  const u = get("SELECT * FROM users WHERE id=?", req.params.id);
  if (!u) return res.status(404).json({ error: "No existe" });
  if (email !== undefined) {
    if (!EMAIL_RE.test(String(email))) return res.status(400).json({ error: "Correo inválido" });
    if (get("SELECT id FROM users WHERE email=? AND id<>?", email.trim(), u.id)) return res.status(400).json({ error: "Ese correo ya está registrado" });
  }
  if (password && String(password).length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  if (u.id === req.user.id && (role && role !== "admin" || active === false)) return res.status(400).json({ error: "No puedes quitarte tu propio acceso de administrador" });
  run(
    "UPDATE users SET name=?, email=?, role=?, active=?, password_hash=? WHERE id=?",
    name ?? u.name, email !== undefined ? email.trim() : u.email, role ?? u.role, active == null ? u.active : (active ? 1 : 0), password ? hashPassword(password) : u.password_hash, u.id,
  );
  if (password || active === false) run("DELETE FROM sessions WHERE user_id=? AND token<>?", u.id, (req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  res.json(publicUser(get("SELECT * FROM users WHERE id=?", u.id)));
});

r.delete("/users/:id", requireAuth, requireRole("admin"), (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: "No puedes desactivarte a ti mismo" });
  run("UPDATE users SET active=0 WHERE id=?", req.params.id);
  run("DELETE FROM sessions WHERE user_id=?", req.params.id);
  res.json({ ok: true });
});

export default r;
