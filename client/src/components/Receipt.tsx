import { useEffect } from "react";
import { create } from "zustand";
import { QRCodeSVG } from "qrcode.react";
import type { Order, Settings } from "@/lib/types";
import { PAYMENT, TYPE } from "@/lib/format";
import { useSettings } from "@/store/settings";
import { api } from "@/lib/api";
import { toast } from "@/store/toast";

interface PrintState { job: { order: Order; kitchen: boolean } | null; set: (job: PrintState["job"]) => void }
const usePrint = create<PrintState>()((set) => ({ job: null, set: (job) => set({ job }) }));

/** Print an order: network (ESC/POS via server) or browser dialog (80mm CSS). */
export async function printOrder(order: Order, { kitchen = false, silent = false } = {}) {
  const s = useSettings.getState().settings;
  if (s?.printer_mode === "network") {
    try {
      if (order.id < 0 || order.pending) await api.post("/api/print/direct", { order, kitchen, settings: s });
      else await api.post(`/api/print/${order.id}?kitchen=${kitchen ? 1 : 0}`);
      if (!silent) toast.success("Ticket enviado a la impresora");
    } catch (e) {
      toast.error("No se pudo imprimir", (e as Error).message);
    }
    return;
  }
  usePrint.getState().set({ order, kitchen });
}

const m = (n: number, cur: string) => `${cur}${Number(n || 0).toFixed(2)}`;

export function ReceiptView({ order, settings, kitchen = false }: { order: Order; settings: Settings; kitchen?: boolean }) {
  const cur = settings.currency || "$";
  const d = new Date(order.created_at);
  const track = settings.public_url ? `${settings.public_url.replace(/\/$/, "")}/seguir/${order.code}` : "";
  return (
    <div className="receipt">
      {!kitchen && <img src="/brand/wordmark.png" alt="" className="logo" />}
      <div className="c xl">{settings.business_name}</div>
      {!kitchen && (
        <>
          <div className="c">{settings.business_tagline}</div>
          {settings.business_address && <div className="c">{settings.business_address}</div>}
          {settings.business_phone && <div className="c">{settings.business_phone}</div>}
        </>
      )}
      <div className="hr2" />
      <div className="c xl">{kitchen ? "COCINA" : "PEDIDO"} #{order.daily_number}</div>
      <div className="c b">{TYPE[order.type].label.toUpperCase()}{order.table_no ? ` · Mesa ${order.table_no}` : ""}</div>
      {order.customer_name && <div className="c">Cliente: {order.customer_name}</div>}
      {order.type === "delivery" ? (
        <div className="box">
          <div className="c xl">ENTREGA A DOMICILIO</div>
          {order.customer_name && <div className="lg">{order.customer_name}</div>}
          {order.customer_phone && <div className="lg">Tel: {order.customer_phone}</div>}
          {order.customer_address && <div className="lg">Dir: {order.customer_address}</div>}
          {order.customer_reference && <div className="b">Ref: {order.customer_reference}</div>}
          <div className="hr" />
          {order.paid
            ? <div className="c b">PAGADO{order.payment_method ? ` · ${PAYMENT[order.payment_method]}` : ""}</div>
            : <div className="c lg">COBRAR AL ENTREGAR: {m(order.total, cur)}</div>}
        </div>
      ) : order.customer_phone ? <div className="c">Tel: {order.customer_phone}</div> : null}
      <div className="row"><span>{order.code}</span><span>{d.toLocaleDateString("es")} {d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</span></div>
      <div className="hr" />
      {order.items.map((it, i) => (
        <div key={i}>
          {kitchen ? (
            <div className="lg">{it.qty} × {it.name}</div>
          ) : (
            <div className="row"><span>{it.qty} × {it.name}</span><span>{m(it.price * it.qty, cur)}</span></div>
          )}
          {it.notes && <div style={{ paddingLeft: 12 }}>» {it.notes}</div>}
        </div>
      ))}
      <div className="hr" />
      {!kitchen && (
        <>
          {order.discount > 0 && (<><div className="row"><span>Subtotal</span><span>{m(order.subtotal, cur)}</span></div><div className="row"><span>Descuento</span><span>-{m(order.discount, cur)}</span></div></>)}
          {order.tax > 0 && <div className="row"><span>Impuesto</span><span>{m(order.tax, cur)}</span></div>}
          <div className="row lg"><span>TOTAL</span><span>{m(order.total, cur)}</span></div>
          {order.payment_method && (
            <>
              <div className="row"><span>Pago</span><span>{PAYMENT[order.payment_method]}</span></div>
              {order.payment_method === "cash" && order.cash_received != null && (
                <><div className="row"><span>Recibido</span><span>{m(order.cash_received, cur)}</span></div><div className="row"><span>Cambio</span><span>{m(order.cash_received - order.total, cur)}</span></div></>
              )}
            </>
          )}
          {!order.paid && <div className="c b" style={{ marginTop: 4 }}>*** PENDIENTE DE PAGO ***</div>}
          <div className="hr" />
          {order.notes && <div>Nota: {order.notes}</div>}
          {track && (
            <div className="c" style={{ marginTop: 6 }}>
              <div>Sigue tu pedido:</div>
              <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}><QRCodeSVG value={track} size={96} /></div>
              <div style={{ fontSize: 10 }}>{track}</div>
            </div>
          )}
          <div className="c" style={{ marginTop: 6 }}>{settings.receipt_footer}</div>
        </>
      )}
      {kitchen && order.notes && <div className="lg">NOTA: {order.notes}</div>}
    </div>
  );
}

/** Mounted once in App. Renders the pending job into #print-root and opens the print dialog. */
export function PrintHost() {
  const job = usePrint((s) => s.job);
  const settings = useSettings((s) => s.settings);
  useEffect(() => {
    if (!job || !settings) return;
    const t = setTimeout(() => {
      window.print();
      usePrint.getState().set(null);
    }, 150);
    return () => clearTimeout(t);
  }, [job, settings]);
  if (!job || !settings) return null;
  return <div id="print-root"><ReceiptView order={job.order} settings={settings} kitchen={job.kitchen} /></div>;
}
