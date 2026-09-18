import { Router } from "express";
import { get, all, run, now } from "../db.js";
import { saveImage } from "../storage.js";
import { requireAuth, requireRole } from "./auth.js";

const r = Router();
const admin = [requireAuth, requireRole("admin")];
const id = (v) => Number(v) || 0;

// ---------- categories ----------
r.get("/categories", async (_req, res) => res.json(await all("SELECT * FROM categories ORDER BY sort, id")));
r.post("/categories", ...admin, async (req, res) => {
  const { name, emoji = "🍽️", color = "#F2915A" } = req.body;
  if (!name) return res.status(400).json({ error: "Nombre requerido" });
  const sort = ((await get("SELECT COALESCE(MAX(sort),0) AS m FROM categories")).m || 0) + 1;
  const x = await run("INSERT INTO categories(name,emoji,color,sort) VALUES(?,?,?,?)", name, emoji, color, sort);
  res.json(await get("SELECT * FROM categories WHERE id=?", x.lastInsertRowid));
});
r.put("/categories/:id", ...admin, async (req, res) => {
  const c = await get("SELECT * FROM categories WHERE id=?", id(req.params.id));
  if (!c) return res.status(404).json({ error: "No existe" });
  const { name = c.name, emoji = c.emoji, color = c.color, sort = c.sort } = req.body;
  await run("UPDATE categories SET name=?,emoji=?,color=?,sort=? WHERE id=?", name, emoji, color, Number(sort), c.id);
  res.json(await get("SELECT * FROM categories WHERE id=?", c.id));
});
r.delete("/categories/:id", ...admin, async (req, res) => {
  await run("DELETE FROM categories WHERE id=?", id(req.params.id));
  res.json({ ok: true });
});

// ---------- products ----------
const productQuery = `
  SELECT p.*, c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color,
    COALESCE((SELECT json_agg(json_build_object('ingredient_id', pi.ingredient_id, 'qty', pi.qty, 'name', i.name, 'unit', i.unit) ORDER BY i.name)
       FROM product_ingredients pi JOIN ingredients i ON i.id = pi.ingredient_id WHERE pi.product_id = p.id), '[]'::json) AS recipe
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

const parseProduct = (p) => p && ({ ...p, recipe: typeof p.recipe === "string" ? JSON.parse(p.recipe) : (p.recipe || []), active: !!p.active, track_stock: !!p.track_stock });

r.get("/products", async (req, res) => {
  const rows = await all(`${productQuery} ${req.query.all ? "" : "WHERE p.active=1"} ORDER BY p.sort, p.id`);
  res.json(rows.map(parseProduct));
});

async function upsertRecipe(productId, recipe) {
  if (!Array.isArray(recipe)) return;
  await run("DELETE FROM product_ingredients WHERE product_id=?", productId);
  for (const it of recipe) {
    if (it.ingredient_id && Number(it.qty) > 0)
      await run("INSERT INTO product_ingredients(product_id,ingredient_id,qty) VALUES(?,?,?) ON CONFLICT DO NOTHING", productId, Number(it.ingredient_id), Number(it.qty));
  }
}

r.post("/products", ...admin, async (req, res) => {
  const b = req.body;
  if (!b.name || b.price == null) return res.status(400).json({ error: "Nombre y precio son requeridos" });
  const sort = ((await get("SELECT COALESCE(MAX(sort),0) AS m FROM products")).m || 0) + 1;
  const x = await run(
    "INSERT INTO products(category_id,name,description,price,cost,emoji,active,track_stock,stock,min_stock,sort,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    b.category_id || null, b.name, b.description || "", Number(b.price), Number(b.cost || 0), b.emoji || "🍽️",
    b.active === false ? 0 : 1, b.track_stock ? 1 : 0, Number(b.stock || 0), Number(b.min_stock || 5), sort, now(),
  );
  const pid = x.lastInsertRowid;
  const img = await saveImage(b.image, `p${pid}-${Date.now()}`);
  if (img) await run("UPDATE products SET image=? WHERE id=?", img, pid);
  await upsertRecipe(pid, b.recipe);
  res.json(parseProduct(await get(`${productQuery} WHERE p.id=?`, pid)));
});

r.put("/products/:id", ...admin, async (req, res) => {
  const p = await get("SELECT * FROM products WHERE id=?", id(req.params.id));
  if (!p) return res.status(404).json({ error: "No existe" });
  const b = req.body;
  let image = p.image;
  if (b.image === null) image = null;
  else if (b.image && b.image.startsWith("data:")) image = (await saveImage(b.image, `p${p.id}-${Date.now()}`)) || image;
  await run(
    "UPDATE products SET category_id=?,name=?,description=?,price=?,cost=?,emoji=?,image=?,active=?,track_stock=?,stock=?,min_stock=?,sort=? WHERE id=?",
    b.category_id === undefined ? p.category_id : (b.category_id || null),
    b.name ?? p.name, b.description ?? p.description, Number(b.price ?? p.price), Number(b.cost ?? p.cost), b.emoji ?? p.emoji, image,
    b.active == null ? p.active : (b.active ? 1 : 0), b.track_stock == null ? p.track_stock : (b.track_stock ? 1 : 0),
    Number(b.stock ?? p.stock), Number(b.min_stock ?? p.min_stock), Number(b.sort ?? p.sort), p.id,
  );
  await upsertRecipe(p.id, b.recipe);
  res.json(parseProduct(await get(`${productQuery} WHERE p.id=?`, p.id)));
});

r.delete("/products/:id", ...admin, async (req, res) => {
  await run("UPDATE products SET active=0 WHERE id=?", id(req.params.id));
  res.json({ ok: true });
});

export default r;
