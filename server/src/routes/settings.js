import { Router } from "express";
import { getSettings, setSetting, transaction, query } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";
import { testConnection } from "../telegram.js";

const PUBLIC_KEYS = ["business_name", "business_tagline", "business_address", "business_phone", "currency", "tax_rate", "receipt_footer", "order_prefix", "public_url", "receipt_show_logo", "receipt_show_customer", "receipt_show_notes", "receipt_show_tracking", "receipt_social", "receipt_wifi", "receipt_show_tagline", "receipt_show_address", "receipt_show_phone", "receipt_show_payment", "receipt_show_change", "receipt_show_items_price", "receipt_show_subtotal", "receipt_show_tax", "receipt_show_order_type", "receipt_show_date", "receipt_show_order_number", "receipt_separator_style", "receipt_font_size", "receipt_header_text", "receipt_show_emoji"];
const r = Router();

r.get("/", async (req, res) => {
  const s = await getSettings();
  if (req.user?.role === "admin") return res.json(s);
  const out = {};
  for (const k of [...PUBLIC_KEYS, "printer_mode", "auto_print", "printer_width"]) out[k] = s[k];
  res.json(out);
});

r.put("/", requireAuth, requireRole("admin"), async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (/^[a-z_]+$/.test(k)) await setSetting(k, v);
  }
  res.json(await getSettings());
});

// Verify the Telegram bot + chat (body overrides saved values) and post a confirmation message there.
r.post("/telegram/test", requireAuth, requireRole("admin"), async (req, res) => {
  const s = await getSettings();
  const token = String(req.body?.telegram_bot_token ?? s.telegram_bot_token ?? "").trim();
  const chat = String(req.body?.telegram_chat_id ?? s.telegram_chat_id ?? "").trim();
  if (!token || !chat) return res.status(400).json({ error: "Indica el token del bot y el ID del chat" });
  try {
    res.json(await testConnection(token, chat));
  } catch (e) {
    res.status(400).json({ error: `Telegram: ${e.message}` });
  }
});

// ---- Borrado de datos (solo admin) ---------------------------------------------
// Each scope is independent and predictable: sales history (orders + their stock
// movements), products, categories and ingredients. `all` wipes everything except
// users, sessions and settings.
const WIPE = {
  sales: ["DELETE FROM stock_movements WHERE order_id IS NOT NULL", "DELETE FROM orders"],
  products: ["DELETE FROM stock_movements WHERE item_type='product' AND order_id IS NULL", "DELETE FROM products"],
  categories: ["DELETE FROM categories"],
  ingredients: ["DELETE FROM stock_movements WHERE item_type='ingredient' AND order_id IS NULL", "DELETE FROM ingredients"],
  all: ["DELETE FROM stock_movements", "DELETE FROM orders", "DELETE FROM products", "DELETE FROM categories", "DELETE FROM ingredients"],
};

r.post("/wipe", requireAuth, requireRole("admin"), async (req, res) => {
  const scope = String(req.body?.scope || "");
  if (!WIPE[scope]) return res.status(400).json({ error: "Indica qué datos borrar" });
  const count = async (table) => (await query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
  const before = {
    orders: await count("orders"), products: await count("products"), categories: await count("categories"),
    ingredients: await count("ingredients"), movements: await count("stock_movements"),
  };
  await transaction(async () => {
    for (const sql of WIPE[scope]) await query(sql);
  });
  res.json({ ok: true, deleted: before });
});

export default r;
