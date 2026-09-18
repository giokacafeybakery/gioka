import { Router } from "express";
import { getSettings, isDbOffline } from "../db.js";
import { requireRole } from "./auth.js";
import { loadOrder } from "./orders.js";
import { receiptBuffer, sendToPrinter, EscPos } from "../escpos.js";

const r = Router();
r.use(requireRole("admin", "cajero", "cocina"));

async function send(buffer, s) {
  s ||= await getSettings();
  if (s.printer_mode !== "network") {
    const e = new Error("La impresión directa está desactivada. Activa el modo 'red' en Ajustes → Impresora.");
    e.status = 400; throw e;
  }
  await sendToPrinter(s.printer_host, s.printer_port, buffer);
}

r.post("/test", async (_req, res, next) => {
  try {
    const s = await getSettings();
    const p = new EscPos(Number(s.printer_width) || 42);
    p.align("center").bold(true).size(2, 2).text(s.business_name || "Gioka").size(1, 1).bold(false)
      .text("Prueba de impresion OK").line("-").text(new Date().toLocaleString("es")).feed(3).cut();
    await send(p.build());
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Print an order that only exists on the device (created offline). The client sends the order and, in case the database
// is unreachable, its cached settings, so LAN printers keep working during an internet outage.
r.post("/direct", async (req, res, next) => {
  try {
    const { order, kitchen, settings: cached } = req.body || {};
    if (!order || !Array.isArray(order.items) || !order.items.length) return res.status(400).json({ error: "Pedido inválido" });
    let s;
    try { s = await getSettings(); } catch (e) { if (!isDbOffline(e) || !cached) throw e; s = cached; }
    await send(receiptBuffer(order, s, { kitchen: !!kitchen }), s);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post("/:orderId", async (req, res, next) => {
  try {
    const order = await loadOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: "No existe" });
    const s = await getSettings();
    await send(receiptBuffer(order, s, { kitchen: req.query.kitchen === "1" }), s);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
