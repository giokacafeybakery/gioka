import { Router } from "express";
import { getSettings, setSetting } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";

const PUBLIC_KEYS = ["business_name", "business_tagline", "business_address", "business_phone", "currency", "tax_rate", "receipt_footer", "order_prefix", "public_url"];
const r = Router();

r.get("/", (req, res) => {
  const s = getSettings();
  if (req.user?.role === "admin") return res.json(s);
  const out = {};
  for (const k of [...PUBLIC_KEYS, "printer_mode", "auto_print", "printer_width"]) out[k] = s[k];
  res.json(out);
});

r.put("/", requireAuth, requireRole("admin"), (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (/^[a-z_]+$/.test(k)) setSetting(k, v);
  }
  res.json(getSettings());
});

export default r;
