import { Router } from "express";
import { getSettings } from "../db.js";
import { loadOrder } from "./orders.js";
import { receiptBuffer, sendToPrinter, EscPos } from "../escpos.js";

const r = Router();

async function send(buffer) {
  const s = getSettings();
  if (s.printer_mode !== "network") {
    const e = new Error("La impresión directa está desactivada. Activa el modo 'red' en Ajustes → Impresora.");
    e.status = 400; throw e;
  }
  await sendToPrinter(s.printer_host, s.printer_port, buffer);
}

r.post("/test", async (_req, res, next) => {
  try {
    const s = getSettings();
    const p = new EscPos(Number(s.printer_width) || 42);
    p.align("center").bold(true).size(2, 2).text(s.business_name || "Gioka").size(1, 1).bold(false)
      .text("Prueba de impresion OK").line("-").text(new Date().toLocaleString("es")).feed(3).cut();
    await send(p.build());
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post("/:orderId", async (req, res, next) => {
  try {
    const order = loadOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: "No existe" });
    const s = getSettings();
    await send(receiptBuffer(order, s, { kitchen: req.query.kitchen === "1" }));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
