// Minimal ESC/POS builder + raw TCP sender (port 9100) — no native deps.
import net from "node:net";

const ESC = 0x1b, GS = 0x1d;

// Replace accents so CP437/CP850 printers render readable text.
function ascii(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "");
}

export class EscPos {
  constructor(width = 42) {
    this.width = width;
    this.buf = [];
    this.raw([ESC, 0x40]); // init
  }
  raw(bytes) { this.buf.push(Buffer.from(bytes)); return this; }
  text(s = "") { this.buf.push(Buffer.from(ascii(s) + "\n", "latin1")); return this; }
  align(a) { return this.raw([ESC, 0x61, { left: 0, center: 1, right: 2 }[a] ?? 0]); }
  bold(on) { return this.raw([ESC, 0x45, on ? 1 : 0]); }
  size(w = 1, h = 1) { return this.raw([GS, 0x21, ((w - 1) << 4) | (h - 1)]); }
  line(ch = "-") { return this.text(ch.repeat(this.width)); }
  feed(n = 1) { return this.raw([ESC, 0x64, n]); }
  cut() { return this.raw([GS, 0x56, 0x42, 0x00]); }
  drawer() { return this.raw([ESC, 0x70, 0x00, 0x19, 0xfa]); }
  cols(left, right) {
    const l = ascii(left), r = ascii(right);
    const space = Math.max(1, this.width - l.length - r.length);
    return this.text(l + " ".repeat(space) + r);
  }
  qr(data) {
    const d = Buffer.from(String(data), "latin1");
    const len = d.length + 3;
    this.raw([GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00]); // model 2
    this.raw([GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 0x06]); // size
    this.raw([GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x30]); // error correction
    this.raw([GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30]);
    this.buf.push(d);
    this.raw([GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30]); // print
    return this;
  }
  build() { return Buffer.concat(this.buf); }
}

export function sendToPrinter(host, port, buffer, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port: Number(port) || 9100 });
    const timer = setTimeout(() => { sock.destroy(); reject(new Error("Tiempo de espera agotado al conectar con la impresora")); }, timeoutMs);
    sock.on("connect", () => sock.end(buffer));
    sock.on("close", () => { clearTimeout(timer); resolve(); });
    sock.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

const money = (cur, n) => `${cur}${Number(n || 0).toFixed(2)}`;
const TYPE = { takeaway: "PARA LLEVAR", delivery: "DELIVERY", dinein: "EN MESA" };
const PAY = { cash: "Efectivo", card: "Tarjeta", qr: "QR / Transferencia" };

export function receiptBuffer(order, settings, { kitchen = false } = {}) {
  const p = new EscPos(Number(settings.printer_width) || 42);
  const cur = settings.currency || "$";
  const date = new Date(order.created_at);
  const dateStr = date.toLocaleString("es", { dateStyle: "short", timeStyle: "short" });

  p.align("center").bold(true).size(2, 2).text(settings.business_name || "Gioka").size(1, 1).bold(false);
  if (!kitchen) {
    p.text(settings.business_tagline || "");
    if (settings.business_address) p.text(settings.business_address);
    if (settings.business_phone) p.text(settings.business_phone);
  }
  p.line("=");
  p.bold(true).size(2, 2).text(kitchen ? `COCINA  #${order.daily_number}` : `PEDIDO  #${order.daily_number}`).size(1, 1).bold(false);
  p.text(`${TYPE[order.type] || order.type}${order.table_no ? "  Mesa " + order.table_no : ""}`);
  if (order.customer_name) p.text(`Cliente: ${order.customer_name}`);
  p.align("left").text(`Codigo: ${order.code}    ${dateStr}`);
  p.line("-");
  for (const it of order.items) {
    if (kitchen) {
      p.bold(true).size(1, 2).text(`${it.qty} x ${it.name}`).size(1, 1).bold(false);
    } else {
      p.cols(`${it.qty} x ${it.name}`, money(cur, it.price * it.qty));
    }
    if (it.notes) p.text(`   * ${it.notes}`);
  }
  p.line("-");
  if (!kitchen) {
    if (order.discount > 0) {
      p.cols("Subtotal", money(cur, order.subtotal));
      p.cols("Descuento", "-" + money(cur, order.discount));
    }
    if (order.tax > 0) p.cols("Impuesto", money(cur, order.tax));
    p.bold(true).size(1, 2).cols("TOTAL", money(cur, order.total)).size(1, 1).bold(false);
    if (order.payment_method) {
      p.cols("Pago", PAY[order.payment_method] || order.payment_method);
      if (order.payment_method === "cash" && order.cash_received != null) {
        p.cols("Recibido", money(cur, order.cash_received));
        p.cols("Cambio", money(cur, order.cash_received - order.total));
      }
    }
    p.line("-");
    if (order.notes) p.text(`Nota: ${order.notes}`);
    if (settings.public_url) {
      p.align("center").text("Sigue tu pedido:");
      p.qr(`${settings.public_url.replace(/\/$/, "")}/seguir/${order.code}`);
    }
    p.align("center").text(settings.receipt_footer || "");
  } else if (order.notes) {
    p.bold(true).text(`NOTA: ${order.notes}`).bold(false);
  }
  p.feed(3).cut();
  if (!kitchen && order.payment_method === "cash") p.drawer();
  return p.build();
}
