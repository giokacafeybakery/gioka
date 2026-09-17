import { Router } from "express";
import { get, all, run, now } from "../db.js";
import { requireRole } from "./auth.js";

export function lowStock() {
  const products = all("SELECT id,name,emoji,stock,min_stock,'u' AS unit FROM products WHERE active=1 AND track_stock=1 AND stock<=min_stock ORDER BY stock/NULLIF(min_stock,0)");
  const ingredients = all("SELECT id,name,unit,stock,min_stock,supplier FROM ingredients WHERE stock<=min_stock ORDER BY stock/NULLIF(min_stock,0)");
  return { products, ingredients };
}

export default function inventoryRoutes(io) {
  const r = Router();
  const staff = requireRole("admin");

  r.get("/ingredients", (_req, res) => {
    res.json(all(`SELECT i.*, (SELECT COUNT(*) FROM product_ingredients pi WHERE pi.ingredient_id=i.id) AS used_in FROM ingredients i ORDER BY i.name`));
  });
  r.post("/ingredients", staff, (req, res) => {
    const { name, unit = "u", stock = 0, min_stock = 0, cost = 0, supplier = "" } = req.body;
    if (!name) return res.status(400).json({ error: "Nombre requerido" });
    const x = run("INSERT INTO ingredients(name,unit,stock,min_stock,cost,supplier,created_at) VALUES(?,?,?,?,?,?,?)", name, unit, Number(stock), Number(min_stock), Number(cost), supplier, now());
    if (Number(stock) !== 0)
      run("INSERT INTO stock_movements(item_type,item_id,qty,reason,user_id,created_at) VALUES('ingredient',?,?,?,?,?)", x.lastInsertRowid, Number(stock), "stock inicial", req.user.id, now());
    res.json(get("SELECT * FROM ingredients WHERE id=?", x.lastInsertRowid));
  });
  r.put("/ingredients/:id", staff, (req, res) => {
    const i = get("SELECT * FROM ingredients WHERE id=?", req.params.id);
    if (!i) return res.status(404).json({ error: "No existe" });
    const { name = i.name, unit = i.unit, min_stock = i.min_stock, cost = i.cost, supplier = i.supplier } = req.body;
    run("UPDATE ingredients SET name=?,unit=?,min_stock=?,cost=?,supplier=? WHERE id=?", name, unit, Number(min_stock), Number(cost), supplier, i.id);
    res.json(get("SELECT * FROM ingredients WHERE id=?", i.id));
  });
  r.delete("/ingredients/:id", requireRole("admin"), (req, res) => {
    run("DELETE FROM ingredients WHERE id=?", req.params.id);
    res.json({ ok: true });
  });

  // Adjust stock (product or ingredient): qty is a delta (+ entrada, - salida) or absolute with {set:true}
  r.post("/adjust", staff, (req, res) => {
    const { item_type, item_id, qty, reason = "ajuste", set = false } = req.body;
    if (!["product", "ingredient"].includes(item_type)) return res.status(400).json({ error: "Tipo inválido" });
    const table = item_type === "product" ? "products" : "ingredients";
    const row = get(`SELECT * FROM ${table} WHERE id=?`, item_id);
    if (!row) return res.status(404).json({ error: "No existe" });
    const delta = set ? Number(qty) - row.stock : Number(qty);
    if (!Number.isFinite(delta)) return res.status(400).json({ error: "Cantidad inválida" });
    run(`UPDATE ${table} SET stock = stock + ? ${item_type === "product" ? ", track_stock=1" : ""} WHERE id=?`, delta, item_id);
    run("INSERT INTO stock_movements(item_type,item_id,qty,reason,user_id,created_at) VALUES(?,?,?,?,?,?)", item_type, item_id, delta, reason, req.user.id, now());
    const updated = get(`SELECT * FROM ${table} WHERE id=?`, item_id);
    io.emit("stock:updated", { item_type, item: updated });
    res.json(updated);
  });

  r.get("/movements", (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    res.json(all(`
      SELECT m.*, u.name AS user_name,
        CASE m.item_type WHEN 'product' THEN (SELECT name FROM products WHERE id=m.item_id) ELSE (SELECT name FROM ingredients WHERE id=m.item_id) END AS item_name,
        CASE m.item_type WHEN 'product' THEN 'u' ELSE (SELECT unit FROM ingredients WHERE id=m.item_id) END AS unit,
        (SELECT daily_number FROM orders WHERE id=m.order_id) AS order_number
      FROM stock_movements m LEFT JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT ?`, limit));
  });

  r.get("/low", (_req, res) => res.json(lowStock()));

  return r;
}
