import { Router } from "express";
import { get, all, run, now, transaction } from "../db.js";
import { saveImage } from "../storage.js";
import { caption } from "../telegram.js";
import { requireRole } from "./auth.js";

const id = (v) => Number(v) || 0;

export async function lowStock() {
  const products = await all("SELECT id,name,emoji,stock,min_stock,'u' AS unit FROM products WHERE active=1 AND track_stock=1 AND stock<=min_stock ORDER BY stock/NULLIF(min_stock,0)");
  const ingredients = await all("SELECT id,name,unit,stock,min_stock,supplier FROM ingredients WHERE stock<=min_stock ORDER BY stock/NULLIF(min_stock,0)");
  return { products, ingredients };
}

const savePhoto = (dataUrl, text) => saveImage(dataUrl, `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, { types: "png|jpe?g|webp", caption: text });
const fmtQty = (n, unit) => `${n > 0 ? "+" : ""}${Number(n).toLocaleString("es")} ${unit}`.trim();

const MOVEMENTS_SQL = `
  SELECT m.*, u.name AS user_name, u.role AS user_role,
    CASE m.item_type WHEN 'product' THEN (SELECT name FROM products WHERE id=m.item_id) ELSE (SELECT name FROM ingredients WHERE id=m.item_id) END AS item_name,
    CASE m.item_type WHEN 'product' THEN 'u' ELSE (SELECT unit FROM ingredients WHERE id=m.item_id) END AS unit,
    (SELECT daily_number FROM orders WHERE id=m.order_id) AS order_number
  FROM stock_movements m LEFT JOIN users u ON u.id=m.user_id`;

export default function inventoryRoutes(io) {
  const r = Router();
  const manager = requireRole("admin", "inventario"); // can move stock and manage ingredients
  const admin = requireRole("admin");

  r.get("/ingredients", async (_req, res) => {
    res.json(await all(`SELECT i.*, (SELECT COUNT(*) FROM product_ingredients pi WHERE pi.ingredient_id=i.id) AS used_in FROM ingredients i ORDER BY i.name`));
  });
  r.post("/ingredients", manager, async (req, res) => {
    const { name, unit = "u", stock = 0, min_stock = 0, cost = 0, supplier = "", photo } = req.body;
    if (!name) return res.status(400).json({ error: "Nombre requerido" });
    if (req.user.role === "inventario" && Number(stock) !== 0 && !photo) return res.status(400).json({ error: "Adjunta la foto del comprobante del stock inicial" });
    const photoPath = Number(stock) !== 0
      ? await savePhoto(photo, caption(["🧾 Stock inicial", { b: name }, fmtQty(Number(stock), unit), supplier && `🏪 ${supplier}`, `👤 ${req.user.name}`]))
      : null;
    const x = await run("INSERT INTO ingredients(name,unit,stock,min_stock,cost,supplier,created_at) VALUES(?,?,?,?,?,?,?)", name, unit, Number(stock), Number(min_stock), Number(cost), supplier, now());
    if (Number(stock) !== 0)
      await run("INSERT INTO stock_movements(item_type,item_id,qty,reason,notes,photo,user_id,created_at) VALUES('ingredient',?,?,?,?,?,?,?)", x.lastInsertRowid, Number(stock), "stock inicial", "", photoPath, req.user.id, now());
    res.json(await get("SELECT * FROM ingredients WHERE id=?", x.lastInsertRowid));
  });
  r.put("/ingredients/:id", manager, async (req, res) => {
    const i = await get("SELECT * FROM ingredients WHERE id=?", id(req.params.id));
    if (!i) return res.status(404).json({ error: "No existe" });
    const { name = i.name, unit = i.unit, min_stock = i.min_stock, cost = i.cost, supplier = i.supplier } = req.body;
    await run("UPDATE ingredients SET name=?,unit=?,min_stock=?,cost=?,supplier=? WHERE id=?", name, unit, Number(min_stock), Number(cost), supplier, i.id);
    res.json(await get("SELECT * FROM ingredients WHERE id=?", i.id));
  });
  r.delete("/ingredients/:id", admin, async (req, res) => {
    await run("DELETE FROM ingredients WHERE id=?", id(req.params.id));
    res.json({ ok: true });
  });

  // Adjust stock (product or ingredient): qty is a delta (+ entrada, - salida) or absolute with {set:true}.
  // photo: data URL of the receipt/comprobante (required for the 'inventario' role). reason/notes optional.
  r.post("/adjust", manager, async (req, res) => {
    const { item_type, item_id, qty, reason, notes = "", set = false, photo } = req.body;
    if (!["product", "ingredient"].includes(item_type)) return res.status(400).json({ error: "Tipo inválido" });
    const table = item_type === "product" ? "products" : "ingredients";
    const row = await get(`SELECT * FROM ${table} WHERE id=?`, id(item_id));
    if (!row) return res.status(404).json({ error: "No existe" });
    const delta = set ? Number(qty) - row.stock : Number(qty);
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "Cantidad inválida" });
    if (req.user.role === "inventario" && !photo) return res.status(400).json({ error: "Adjunta la foto del comprobante" });
    const unit = item_type === "product" ? "u" : row.unit;
    const photoPath = await savePhoto(photo, caption([
      delta > 0 ? "📥 Entrada de stock" : "📤 Salida de stock", { b: row.name },
      `${fmtQty(delta, unit)} → queda ${fmtQty(row.stock + delta, unit).replace(/^\+/, "")}`,
      `🏷️ ${reason || (delta > 0 ? "entrada" : "salida")}`, notes && `📝 ${String(notes).slice(0, 300)}`, `👤 ${req.user.name}`,
    ]));
    if (photo && !photoPath) return res.status(400).json({ error: "La foto debe ser JPG, PNG o WebP" });
    await transaction(async () => {
      await run(`UPDATE ${table} SET stock = stock + ? ${item_type === "product" ? ", track_stock=1" : ""} WHERE id=?`, delta, row.id);
      await run("INSERT INTO stock_movements(item_type,item_id,qty,reason,notes,photo,user_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
        item_type, row.id, delta, String(reason || (delta > 0 ? "entrada" : "salida")), String(notes || "").slice(0, 500), photoPath, req.user.id, now());
    });
    const updated = await get(`SELECT * FROM ${table} WHERE id=?`, row.id);
    io.emit("stock:updated", { item_type, item: updated });
    res.json(updated);
  });

  r.get("/movements", async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const manual = req.query.manual ? "WHERE m.order_id IS NULL" : "";
    res.json(await all(`${MOVEMENTS_SQL} ${manual} ORDER BY m.id DESC LIMIT ?`, limit));
  });

  r.get("/low", async (_req, res) => res.json(await lowStock()));

  return r;
}
