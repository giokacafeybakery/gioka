// Data layer on Postgres (Supabase). Same helper names as before (get/all/run) but async;
// SQL keeps `?` placeholders which are rewritten to $1..$n. Inside `transaction()` every helper
// automatically uses the transaction's client (AsyncLocalStorage), so nested code needs no plumbing.
import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { loadEnv } from "./env.js";

loadEnv();

if (!process.env.DATABASE_URL) {
  const msg = "Falta DATABASE_URL (cadena de conexión de Supabase) en server/.env o en las variables de entorno.";
  if (process.env.VERCEL) throw new Error(msg);
  console.error(msg);
  process.exit(1);
}

// Vercel creates multiple short-lived instances. A Supabase shared-pooler URL on :5432 is session mode and
// reserves one backend connection per client; switch that same endpoint to transaction mode (:6543) in serverless.
// Keep the original mode for the persistent local/LAN server.
const databaseUrl = process.env.VERCEL
  ? process.env.DATABASE_URL.replace(/(\.pooler\.supabase\.com):5432(?=\/|$)/i, "$1:6543")
  : process.env.DATABASE_URL;

// int8 / numeric come back as strings by default → numbers (COUNT, SUM, AVG)
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);

export const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : { rejectUnauthorized: false },
  // Supabase recommends exactly one application-side connection per warm serverless instance.
  max: process.env.VERCEL ? 1 : (Number(process.env.PG_POOL_MAX) || 8),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000, // sin internet: fallar rápido en vez de colgar la petición
  query_timeout: 12_000,           // conexión ya abierta pero la red se cayó: la consulta no queda colgada para siempre
});
pool.on("error", (e) => console.error("Postgres pool:", e.message));

/** True when the error means "no se puede hablar con la base de datos" (red caída, DNS, Supabase inaccesible). */
export function isDbOffline(e) {
  if (!e) return false;
  if (e.code && /^(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE|EMAXCONNSESSION|53300)$/.test(String(e.code))) return true;
  if (e.code && /^(08|57P0)/.test(String(e.code))) return true; // connection_exception / admin_shutdown
  return /max clients reached|too many connections|timeout exceeded when trying to connect|Query read timeout|Connection terminated|terminating connection|connection is closed|Client has encountered a connection error/i.test(e.message || "");
}
/** Quick liveness check used by /api/health (never waits more than `ms`). */
export async function dbAlive(ms = 3000) {
  let t;
  try {
    await Promise.race([pool.query("SELECT 1"), new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); })]);
    return true;
  } catch { return false; } finally { clearTimeout(t); }
}

const als = new AsyncLocalStorage();
const client = () => als.getStore() || pool;
const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
const ID_TABLES = /^\s*INSERT\s+INTO\s+(users|categories|products|ingredients|stock_movements|cash_sessions|orders|order_items)\b/i;

export async function query(sql, params = []) {
  return client().query(toPg(sql), params);
}
export const get = async (sql, ...p) => (await query(sql, p)).rows[0];
export const all = async (sql, ...p) => (await query(sql, p)).rows;
export async function run(sql, ...p) {
  const returning = ID_TABLES.test(sql) && !/RETURNING/i.test(sql);
  const r = await query(returning ? `${sql} RETURNING id` : sql, p);
  return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
}
/** Run fn inside BEGIN/COMMIT; get/all/run called (transitively) within it use the same connection. */
export async function transaction(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await als.run(c, fn);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export const TZ = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
/** SQL fragments for local-day grouping (dates are stored as ISO UTC text). */
export const localDay = (col) => `to_char((${col})::timestamptz AT TIME ZONE '${TZ.replace(/'/g, "")}', 'YYYY-MM-DD')`;
export const localHour = (col) => `EXTRACT(HOUR FROM (${col})::timestamptz AT TIME ZONE '${TZ.replace(/'/g, "")}')::int`;

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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','cajero','cocina','inventario')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🍽️',
  color TEXT NOT NULL DEFAULT '#F2915A',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  emoji TEXT NOT NULL DEFAULT '🍽️',
  image TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  track_stock INTEGER NOT NULL DEFAULT 0,
  stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_stock DOUBLE PRECISION NOT NULL DEFAULT 5,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ingredients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT,
  unit TEXT NOT NULL DEFAULT 'u',
  stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_ingredients (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  qty DOUBLE PRECISION NOT NULL DEFAULT 1,
  PRIMARY KEY (product_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  item_type TEXT NOT NULL CHECK(item_type IN ('product','ingredient')),
  item_id INTEGER NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  photo TEXT,
  order_id INTEGER,
  user_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cash_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  opening_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  closing_amount DOUBLE PRECISION,
  expected_amount DOUBLE PRECISION,
  notes TEXT NOT NULL DEFAULT '',
  opened_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  daily_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('takeaway','delivery','dinein')),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  table_no TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('pending','preparing','ready','delivered','cancelled','refunded')),
  payment_method TEXT CHECK(payment_method IN ('cash','card','qr')),
  paid INTEGER NOT NULL DEFAULT 0,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  cash_received DOUBLE PRECISION,
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
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  price DOUBLE PRECISION NOT NULL,
  qty INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
-- Sincronización offline: cada operación creada sin conexión trae un client_id (UUID) que la hace idempotente al reenviarse.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offline INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS offline INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS offline INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS image TEXT;
-- Delivery: dirección y punto de referencia para que el repartidor ubique al cliente con la factura.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_reference TEXT NOT NULL DEFAULT '';
-- Sabores y adicionales: grupos de opciones del producto (JSON) y la selección guardada en cada línea del pedido.
ALTER TABLE products ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'::jsonb;
-- Devolución / reembolso: registra cómo se devolvió el dinero al cliente.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TEXT;
-- Migrate the CHECK constraint to include 'refunded' for databases created before this migration.
DO $$ BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
  ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('pending','preparing','ready','delivered','cancelled','refunded'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_id ON orders(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS movements_client_id ON stock_movements(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_client_id ON cash_sessions(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS ingredients_client_id ON ingredients(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_cash_session ON orders(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_movements_order ON stock_movements(order_id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TEXT;
`;

/** Start/end (ISO UTC) of the server-local day that contains `iso` (default: now). */
export function localDayBounds(iso) {
  const d = iso ? new Date(iso) : new Date();
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
/** Timestamp sent by an offline device: accepted if it parses and is not in the future (more than 5 min) nor older than 30 days. */
export function clientTime(iso, fallback = now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return fallback;
  const n = Date.now();
  if (t > n + 5 * 60_000 || t < n - 30 * 86_400_000) return fallback;
  return new Date(t).toISOString();
}
/** Idempotency key sent by the client (UUID-like); anything else is ignored. */
export const clientId = (v) => (typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null);


export async function getSettings() {
  const s = {};
  for (const r of await all("SELECT key, value FROM settings")) {
    try { s[r.key] = JSON.parse(r.value); } catch { s[r.key] = r.value; }
  }
  return s;
}
export async function setSetting(key, value) {
  await run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, JSON.stringify(value));
}

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
  telegram_bot_token: "", // bot de @BotFather; con chat id, cada foto del app se reenvía a ese chat/canal
  telegram_chat_id: "",
  receipt_show_logo: true,
  receipt_show_customer: true,
  receipt_show_notes: true,
  receipt_show_tracking: true,
  receipt_social: "",
  receipt_wifi: "",
  receipt_show_tagline: true,
  receipt_show_address: true,
  receipt_show_phone: true,
  receipt_show_payment: true,
  receipt_show_change: true,
  receipt_show_items_price: true,
  receipt_show_subtotal: true,
  receipt_show_tax: true,
  receipt_show_order_type: true,
  receipt_show_date: true,
  receipt_show_order_number: true,
  receipt_separator_style: "dashed",
  receipt_font_size: "normal",
  receipt_header_text: "",
  receipt_show_emoji: false,
};

/** Create tables (idempotent) and seed demo data on an empty database. Called once at startup. */
export async function initDb() {
  await pool.query(SCHEMA);
  // Row Level Security sin políticas: la clave pública (anon) que llevan los navegadores para Realtime no puede leer
  // ni escribir nada por la API REST de Supabase; el servidor entra como `postgres` (bypass RLS).
  for (const t of ["users", "sessions", "categories", "products", "ingredients", "product_ingredients", "orders", "order_items", "stock_movements", "cash_sessions", "settings"]) {
    await pool.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(await get("SELECT 1 FROM settings WHERE key=?", k))) await setSetting(k, v);
  }
  if (!(await get("SELECT 1 FROM users LIMIT 1"))) {
    const t = now();
    for (const [name, email, pass, role] of [
      ["Administrador", "admin@gioka.com", "admin123", "admin"],
      ["Cajero", "cajero@gioka.com", "cajero123", "cajero"],
      ["Cocina", "cocina@gioka.com", "cocina123", "cocina"],
      ["Inventario", "inventario@gioka.com", "inventario123", "inventario"],
    ]) await run("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)", name, email, hashPassword(pass), role, t);
  }
  if (!(await get("SELECT 1 FROM categories LIMIT 1"))) await transaction(() => seedCatalog());
  // Cleanup expired sessions at startup
  await cleanupExpiredSessions();
}

async function seedCatalog() {
  const t = now();
  const cats = [
    ["Café", "☕", "#C98B5E", 1],
    ["Helados", "🍨", "#F5A3B5", 2],
    ["Panadería", "🥐", "#F2B84B", 3],
    ["Postres", "🍰", "#B48CF2", 4],
    ["Bebidas", "🥤", "#6CC5E8", 5],
    ["Salados", "🥪", "#7ED0A5", 6],
  ];
  for (const c of cats) await run("INSERT INTO categories(name,emoji,color,sort) VALUES(?,?,?,?)", ...c);

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
  for (const i of ings) await run("INSERT INTO ingredients(name,unit,stock,min_stock,cost,supplier,created_at) VALUES(?,?,?,?,?,?,?)", ...i, t);

  const choices = (...names) => names.map((n) => (Array.isArray(n) ? { name: n[0], price: n[1] } : { name: n, price: 0 }));
  const FLAVOR = (type) => ({ name: "Sabor", type, required: true, choices: choices("Vainilla", "Chocolate", "Fresa", "Pistacho", "Dulce de leche") });
  const TOPPINGS = { name: "Adicionales", type: "multi", required: false, choices: choices(["Chispas", 0.5], ["Salsa de chocolate", 0.5], ["Crema batida", 0.7], ["Nueces", 0.8]) };
  const MILK = { name: "Leche", type: "single", required: false, choices: choices("Entera", ["Deslactosada", 0.3], ["Almendra", 0.6]) };
  const catId = async (n) => (await get("SELECT id FROM categories WHERE name=?", n)).id;
  const ingId = async (n) => (await get("SELECT id FROM ingredients WHERE name=?", n)).id;
  // Helados demo con adicionales que descuentan del inventario: cada opción consume su insumo al venderse.
  const CHOCO = await ingId("Chocolate");
  const CREMA = await ingId("Crema de leche");
  const TOPPINGS_REAL = { name: "Adicionales", type: "multi", required: false, choices: [
    { name: "Chispas", price: 0.5, ingredient_id: CHOCO, qty: 0.02 },
    { name: "Salsa de chocolate", price: 0.5, ingredient_id: CHOCO, qty: 0.03 },
    { name: "Crema batida", price: 0.7, ingredient_id: CREMA, qty: 0.04 },
    { name: "Nueces", price: 0.8 },
  ] };
  const prods = [
    // name, desc, price, cost, emoji, cat, track, stock, min, recipe, options (sabores / adicionales)
    ["Espresso", "Doble shot de café de origen, intenso y aromático.", 2.5, 0.6, "☕", "Café", 0, 0, 0, [["Café en grano", 0.018]]],
    ["Cappuccino", "Espresso con leche vaporizada y espuma cremosa.", 3.8, 1.0, "☕", "Café", 0, 0, 0, [["Café en grano", 0.018], ["Leche", 0.15], ["Vasos 12oz", 1]], [MILK]],
    ["Latte Vainilla", "Suave latte con jarabe de vainilla y arte latte.", 4.2, 1.1, "🍵", "Café", 0, 0, 0, [["Café en grano", 0.018], ["Leche", 0.2], ["Vasos 12oz", 1]]],
    ["Mocha Panda", "Chocolate, espresso y leche con crema batida.", 4.9, 1.4, "🍫", "Café", 0, 0, 0, [["Café en grano", 0.018], ["Leche", 0.18], ["Chocolate", 0.03], ["Vasos 12oz", 1]]],
    ["Cold Brew", "Extracción en frío 18 h, servido con hielo.", 4.0, 0.9, "🧊", "Café", 0, 0, 0, [["Café en grano", 0.025], ["Vasos 12oz", 1]]],
    ["Helado 1 bola", "Elige tu sabor favorito en cono o vaso.", 2.8, 0.7, "🍦", "Helados", 0, 0, 0, [["Conos de waffle", 1], ["Leche", 0.05], ["Crema de leche", 0.03]], [FLAVOR("single"), TOPPINGS_REAL]],
    ["Helado 2 bolas", "Dos sabores artesanales en cono de waffle.", 4.5, 1.2, "🍨", "Helados", 0, 0, 0, [["Conos de waffle", 1], ["Leche", 0.1], ["Crema de leche", 0.06]], [FLAVOR("multi"), TOPPINGS_REAL]],
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
  for (const [i, p] of prods.entries()) {
    const [name, desc, price, cost, emoji, cat, track, stock, min, recipe, options = []] = p;
    const r = await run(
      "INSERT INTO products(category_id,name,description,price,cost,emoji,active,track_stock,stock,min_stock,sort,created_at,options) VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?)",
      await catId(cat), name, desc, price, cost, emoji, track, stock, min, i, t, JSON.stringify(options),
    );
    for (const [ing, qty] of recipe) await run("INSERT INTO product_ingredients(product_id,ingredient_id,qty) VALUES(?,?,?)", r.lastInsertRowid, await ingId(ing), qty);
  }
}

/** Remove tokens that have passed their expiry date. */
export async function cleanupExpiredSessions() {
  try {
    const { changes } = await run("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < ?", now());
    if (changes > 0) console.log(`Limpieza: ${changes} sesiones expiradas eliminadas.`);
  } catch (e) {
    console.warn("Error limpiando sesiones:", e.message);
  }
}

// On the local server (not Vercel), clean up expired sessions every hour.
if (!process.env.VERCEL) {
  const timer = setInterval(() => cleanupExpiredSessions().catch(() => {}), 60 * 60 * 1000);
  if (timer.unref) timer.unref();
}
