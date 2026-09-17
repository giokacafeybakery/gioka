import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { get, all, run, now } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
const r = Router();
const admin = [requireAuth, requireRole("admin")];

// ---------- categories ----------
r.get("/categories", (_req, res) => res.json(all("SELECT * FROM categories ORDER BY sort, id")));
r.post("/categories", ...admin, (req, res) => {
  const { name, emoji = "🍽️", color = "#F2915A" } = req.body;
  if (!name) return res.status(400).json({ error: "Nombre requerido" });
  const sort = (get("SELECT COALESCE(MAX(sort),0) m FROM categories").m || 0) + 1;
  const x = run("INSERT INTO categories(name,emoji,color,sort) VALUES(?,?,?,?)", name, emoji, color, sort);
  res.json(get("SELECT * FROM categories WHERE id=?", x.lastInsertRowid));
});
r.put("/categories/:id", ...admin, (req, res) => {
  const c = get("SELECT * FROM categories WHERE id=?", req.params.id);
  if (!c) return res.status(404).json({ error: "No existe" });
  const { name = c.name, emoji = c.emoji, color = c.color, sort = c.sort } = req.body;
  run("UPDATE categories SET name=?,emoji=?,color=?,sort=? WHERE id=?", name, emoji, color, sort, c.id);
  res.json(get("SELECT * FROM categories WHERE id=?", c.id));
});
r.delete("/categories/:id", ...admin, (req, res) => {
  run("DELETE FROM categories WHERE id=?", req.params.id);
  res.json({ ok: true });
});

// ---------- products ----------
const productQuery = `
  SELECT p.*, c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color,
    (SELECT json_group_array(json_object('ingredient_id', pi.ingredient_id, 'qty', pi.qty, 'name', i.name, 'unit', i.unit))
       FROM product_ingredients pi JOIN ingredients i ON i.id = pi.ingredient_id WHERE pi.product_id = p.id) AS recipe
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

const parseProduct = (p) => p && ({ ...p, recipe: JSON.parse(p.recipe || "[]"), active: !!p.active, track_stock: !!p.track_stock });

r.get("/products", (req, res) => {
  const rows = all(`${productQuery} ${req.query.all ? "" : "WHERE p.active=1"} ORDER BY p.sort, p.id`);
  res.json(rows.map(parseProduct));
});

function saveImage(dataUrl, id) {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
  if (!m) return null;
  fs.mkdirSync(uploadsDir, { recursive: true });
  const file = `p${id}-${Date.now()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  fs.writeFileSync(path.join(uploadsDir, file), Buffer.from(m[2], "base64"));
  return `/uploads/${file}`;
}

function upsertRecipe(productId, recipe) {
  if (!Array.isArray(recipe)) return;
  run("DELETE FROM product_ingredients WHERE product_id=?", productId);
  for (const it of recipe) {
    if (it.ingredient_id && Number(it.qty) > 0)
      run("INSERT INTO product_ingredients(product_id,ingredient_id,qty) VALUES(?,?,?)", productId, it.ingredient_id, Number(it.qty));
  }
}

r.post("/products", ...admin, (req, res) => {
  const b = req.body;
  if (!b.name || b.price == null) return res.status(400).json({ error: "Nombre y precio son requeridos" });
  const sort = (get("SELECT COALESCE(MAX(sort),0) m FROM products").m || 0) + 1;
  const x = run(
    "INSERT INTO products(category_id,name,description,price,cost,emoji,active,track_stock,stock,min_stock,sort,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    b.category_id || null, b.name, b.description || "", Number(b.price), Number(b.cost || 0), b.emoji || "🍽️",
    b.active === false ? 0 : 1, b.track_stock ? 1 : 0, Number(b.stock || 0), Number(b.min_stock || 5), sort, now(),
  );
  const id = x.lastInsertRowid;
  const img = saveImage(b.image, id);
  if (img) run("UPDATE products SET image=? WHERE id=?", img, id);
  upsertRecipe(id, b.recipe);
  res.json(parseProduct(get(`${productQuery} WHERE p.id=?`, id)));
});

r.put("/products/:id", ...admin, (req, res) => {
  const p = get("SELECT * FROM products WHERE id=?", req.params.id);
  if (!p) return res.status(404).json({ error: "No existe" });
  const b = req.body;
  let image = p.image;
  if (b.image === null) image = null;
  else if (b.image && b.image.startsWith("data:")) image = saveImage(b.image, p.id) || image;
  run(
    "UPDATE products SET category_id=?,name=?,description=?,price=?,cost=?,emoji=?,image=?,active=?,track_stock=?,stock=?,min_stock=?,sort=? WHERE id=?",
    b.category_id === undefined ? p.category_id : (b.category_id || null),
    b.name ?? p.name, b.description ?? p.description, Number(b.price ?? p.price), Number(b.cost ?? p.cost), b.emoji ?? p.emoji, image,
    b.active == null ? p.active : (b.active ? 1 : 0), b.track_stock == null ? p.track_stock : (b.track_stock ? 1 : 0),
    Number(b.stock ?? p.stock), Number(b.min_stock ?? p.min_stock), Number(b.sort ?? p.sort), p.id,
  );
  upsertRecipe(p.id, b.recipe);
  res.json(parseProduct(get(`${productQuery} WHERE p.id=?`, p.id)));
});

r.delete("/products/:id", ...admin, (req, res) => {
  run("UPDATE products SET active=0 WHERE id=?", req.params.id);
  res.json({ ok: true });
});

export default r;
