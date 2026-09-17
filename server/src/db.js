import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "gioka.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(String(password), salt, 32).toString("hex")}`;
};
export const verifyPassword = (password, stored) => {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const a = scryptSync(String(password), salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};
export const newToken = () => randomBytes(24).toString("hex");
export const now = () => new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','cajero','cocina')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🍽️',
  color TEXT NOT NULL DEFAULT '#F2915A',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  emoji TEXT NOT NULL DEFAULT '🍽️',
  image TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  track_stock INTEGER NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 5,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'u',
  stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_ingredients (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  qty REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (product_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL CHECK(item_type IN ('product','ingredient')),
  item_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  reason TEXT NOT NULL,
  order_id INTEGER,
  user_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cash_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  opening_amount REAL NOT NULL DEFAULT 0,
  closing_amount REAL,
  expected_amount REAL,
  notes TEXT NOT NULL DEFAULT '',
  opened_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  daily_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('takeaway','delivery','dinein')),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  table_no TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('pending','preparing','ready','delivered','cancelled')),
  payment_method TEXT CHECK(payment_method IN ('cash','card','qr')),
  paid INTEGER NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  cash_received REAL,
  notes TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  cash_session_id INTEGER REFERENCES cash_sessions(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  ready_at TEXT,
  delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`);

// ---------- helpers ----------
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function getSettings() {
  const rows = all("SELECT key, value FROM settings");
  const s = {};
  for (const r of rows) {
    try { s[r.key] = JSON.parse(r.value); } catch { s[r.key] = r.value; }
  }
  return s;
}
export function setSetting(key, value) {
  run(
    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    key,
    JSON.stringify(value),
  );
}

// ---------- seed ----------
const DEFAULT_SETTINGS = {
  business_name: "Gioka",
  business_tagline: "Café · Heladería · Bakery",
  business_address: "Av. Principal 123",
  business_phone: "+00 000 000 000",
  currency: "$",
  tax_rate: 0,
  receipt_footer: "¡Gracias por tu visita!",
  printer_mode: "browser", // 'browser' | 'network'
  printer_host: "192.168.0.100",
  printer_port: 9100,
  printer_width: 42, // chars per line (58mm = 32, 80mm = 42/48)
  auto_print: true,
  order_prefix: "G",
  public_url: "",
};

for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  if (!get("SELECT 1 FROM settings WHERE key=?", k)) setSetting(k, v);
}

// Migration: databases created with the old PIN login → email + password
const userCols = all("PRAGMA table_info(users)").map((c) => c.name);
if (!userCols.includes("email")) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','cajero','cocina')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    INSERT INTO users_new(id,name,email,password_hash,role,active,created_at)
      SELECT id, name, role || id || '@gioka.local', '', role, active, created_at FROM users;
    DROP TABLE users; ALTER TABLE users_new RENAME TO users;
    DELETE FROM sessions;`);
  for (const u of all("SELECT id, role FROM users ORDER BY id")) {
    const email = get("SELECT 1 FROM users WHERE email=?", `${u.role}@gioka.com`) ? `${u.role}${u.id}@gioka.com` : `${u.role}@gioka.com`;
    run("UPDATE users SET email=?, password_hash=? WHERE id=?", email, hashPassword(u.role + "123"), u.id);
  }
  db.exec("PRAGMA foreign_keys = ON");
}

if (!get("SELECT 1 FROM users LIMIT 1")) {
  const t = now();
  run("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)", "Administrador", "admin@gioka.com", hashPassword("admin123"), "admin", t);
  run("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)", "Cajero", "cajero@gioka.com", hashPassword("cajero123"), "cajero", t);
  run("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)", "Cocina", "cocina@gioka.com", hashPassword("cocina123"), "cocina", t);
}

if (!get("SELECT 1 FROM categories LIMIT 1")) {
  const t = now();
  const cats = [
    ["Café", "☕", "#C98B5E", 1],
    ["Helados", "🍨", "#F5A3B5", 2],
    ["Panadería", "🥐", "#F2B84B", 3],
    ["Postres", "🍰", "#B48CF2", 4],
    ["Bebidas", "🥤", "#6CC5E8", 5],
    ["Salados", "🥪", "#7ED0A5", 6],
  ];
  const ins = db.prepare("INSERT INTO categories(name,emoji,color,sort) VALUES(?,?,?,?)");
  for (const c of cats) ins.run(...c);

  const ings = [
    ["Leche", "L", 30, 10, 1.2, "Lácteos del Valle"],
    ["Café en grano", "kg", 8, 3, 18, "Tostadores Andinos"],
    ["Azúcar", "kg", 15, 5, 1.1, "Distribuidora Central"],
    ["Harina", "kg", 25, 8, 0.9, "Molinos Sur"],
    ["Mantequilla", "kg", 6, 3, 7.5, "Lácteos del Valle"],
    ["Huevos", "u", 120, 36, 0.2, "Granja Feliz"],
    ["Chocolate", "kg", 4, 2, 12, "Cacao Real"],
    ["Fresas", "kg", 3, 2, 6, "Frutas Frescas"],
    ["Crema de leche", "L", 6, 3, 3.5, "Lácteos del Valle"],
    ["Vasos 12oz", "u", 200, 100, 0.08, "Empaques Pro"],
    ["Conos de waffle", "u", 45, 60, 0.15, "Empaques Pro"],
    ["Pan de hamburguesa", "u", 20, 15, 0.35, "Molinos Sur"],
  ];
  const insI = db.prepare(
    "INSERT INTO ingredients(name,unit,stock,min_stock,cost,supplier,created_at) VALUES(?,?,?,?,?,?,?)",
  );
  for (const i of ings) insI.run(...i, t);

  const catId = (n) => get("SELECT id FROM categories WHERE name=?", n).id;
  const ingId = (n) => get("SELECT id FROM ingredients WHERE name=?", n).id;
  const prods = [
    // name, desc, price, cost, emoji, cat, track, stock, min, recipe
    ["Espresso", "Doble shot de café de origen, intenso y aromático.", 2.5, 0.6, "☕", "Café", 0, 0, 0, [["Café en grano", 0.018]]],
    ["Cappuccino", "Espresso con leche vaporizada y espuma cremosa.", 3.8, 1.0, "☕", "Café", 0, 0, 0, [["Café en grano", 0.018], ["Leche", 0.15], ["Vasos 12oz", 1]]],
    ["Latte Vainilla", "Suave latte con jarabe de vainilla y arte latte.", 4.2, 1.1, "🍵", "Café", 0, 0, 0, [["Café en grano", 0.018], ["Leche", 0.2], ["Vasos 12oz", 1]]],
    ["Mocha Panda", "Chocolate, espresso y leche con crema batida.", 4.9, 1.4, "🍫", "Café", 0, 0, 0, [["Café en grano", 0.018], ["Leche", 0.18], ["Chocolate", 0.03], ["Vasos 12oz", 1]]],
    ["Cold Brew", "Extracción en frío 18 h, servido con hielo.", 4.0, 0.9, "🧊", "Café", 0, 0, 0, [["Café en grano", 0.025], ["Vasos 12oz", 1]]],
    ["Helado 1 bola", "Elige tu sabor favorito en cono o vaso.", 2.8, 0.7, "🍦", "Helados", 0, 0, 0, [["Conos de waffle", 1], ["Leche", 0.05], ["Crema de leche", 0.03]]],
    ["Helado 2 bolas", "Dos sabores artesanales en cono de waffle.", 4.5, 1.2, "🍨", "Helados", 0, 0, 0, [["Conos de waffle", 1], ["Leche", 0.1], ["Crema de leche", 0.06]]],
    ["Sundae Fresa", "Helado de vainilla, fresas frescas y crema.", 5.5, 1.6, "🍓", "Helados", 0, 0, 0, [["Fresas", 0.08], ["Crema de leche", 0.08], ["Leche", 0.1]]],
    ["Banana Split", "Clásico con tres sabores, banana y chocolate.", 6.9, 2.1, "🍌", "Helados", 0, 0, 0, [["Chocolate", 0.03], ["Crema de leche", 0.1], ["Leche", 0.15]]],
    ["Milkshake Oreo", "Batido cremoso con galletas y crema batida.", 5.2, 1.5, "🥤", "Helados", 0, 0, 0, [["Leche", 0.25], ["Crema de leche", 0.05], ["Vasos 12oz", 1]]],
    ["Croissant Mantequilla", "Hojaldre crujiente horneado cada mañana.", 2.9, 0.7, "🥐", "Panadería", 1, 18, 6, [["Harina", 0.08], ["Mantequilla", 0.04]]],
    ["Pan de Chocolate", "Croissant relleno de chocolate belga.", 3.3, 0.9, "🍫", "Panadería", 1, 12, 6, [["Harina", 0.08], ["Mantequilla", 0.04], ["Chocolate", 0.02]]],
    ["Cinnamon Roll", "Rollo de canela con glaseado de queso crema.", 3.6, 0.9, "🥯", "Panadería", 1, 4, 6, [["Harina", 0.1], ["Azúcar", 0.03], ["Mantequilla", 0.03]]],
    ["Baguette", "Pan rústico de masa madre, 250 g.", 2.2, 0.5, "🥖", "Panadería", 1, 9, 5, [["Harina", 0.2]]],
    ["Cheesecake", "Porción de cheesecake con coulis de frutos rojos.", 4.8, 1.4, "🍰", "Postres", 1, 7, 4, [["Huevos", 1], ["Crema de leche", 0.05], ["Fresas", 0.03]]],
    ["Brownie", "Brownie húmedo con nueces, ideal con helado.", 3.4, 0.8, "🍩", "Postres", 1, 3, 5, [["Chocolate", 0.05], ["Huevos", 1], ["Harina", 0.04]]],
    ["Tarta de Manzana", "Receta de la casa con canela y crumble.", 4.2, 1.1, "🥧", "Postres", 1, 6, 3, [["Harina", 0.08], ["Mantequilla", 0.03], ["Azúcar", 0.03]]],
    ["Limonada de Fresa", "Limonada natural con fresas trituradas.", 3.5, 0.7, "🍓", "Bebidas", 0, 0, 0, [["Fresas", 0.05], ["Azúcar", 0.02], ["Vasos 12oz", 1]]],
    ["Té Chai", "Té negro especiado con leche vaporizada.", 3.6, 0.8, "🫖", "Bebidas", 0, 0, 0, [["Leche", 0.2], ["Vasos 12oz", 1]]],
    ["Agua Mineral", "Botella 500 ml.", 1.5, 0.4, "💧", "Bebidas", 1, 40, 12, []],
    ["Sándwich Panda", "Pollo, queso, lechuga y salsa de la casa.", 5.9, 1.9, "🥪", "Salados", 0, 0, 0, [["Pan de hamburguesa", 1]]],
    ["Tostada de Palta", "Pan de masa madre, palta y huevo pochado.", 6.4, 2.0, "🥑", "Salados", 0, 0, 0, [["Huevos", 1], ["Harina", 0.05]]],
    ["Croque Monsieur", "Jamón, queso gruyere y bechamel gratinado.", 6.2, 2.1, "🧀", "Salados", 0, 0, 0, [["Harina", 0.05], ["Mantequilla", 0.02]]],
  ];
  const insP = db.prepare(
    "INSERT INTO products(category_id,name,description,price,cost,emoji,active,track_stock,stock,min_stock,sort,created_at) VALUES(?,?,?,?,?,?,1,?,?,?,?,?)",
  );
  const insR = db.prepare("INSERT INTO product_ingredients(product_id,ingredient_id,qty) VALUES(?,?,?)");
  prods.forEach((p, i) => {
    const [name, desc, price, cost, emoji, cat, track, stock, min, recipe] = p;
    const r = insP.run(catId(cat), name, desc, price, cost, emoji, track, stock, min, i, t);
    for (const [ing, qty] of recipe) insR.run(r.lastInsertRowid, ingId(ing), qty);
  });
}
