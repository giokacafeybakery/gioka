import { useEffect, useRef, useState } from "react";
import { Printer, Wifi, Check, MonitorPlay } from "lucide-react";
import { Modal, Toggle } from "./ui";
import { PrintSetupGuide } from "./PrintSetupGuide";
import { printOrder } from "./Receipt";
import { usePrintStation, isLocalOrder, claimPrint } from "@/lib/printStation";
import { useSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/toast";
import type { Order } from "@/lib/types";

/** Solo caja y administración imprimen (el mesero toma el pedido, nunca el ticket). */
export const canPrint = (role?: string) => role === "admin" || role === "cajero";

/**
 * Escucha los pedidos que entran en vivo e imprime la comanda en este dispositivo.
 * Va montado en el AppShell, así funciona esté donde esté el cajero (PDV, pedidos, caja…).
 *
 * En modo "red" no hace falta: el servidor manda el ESC/POS a la impresora al crear el pedido.
 */
/** Cada cuánto se revisan los pedidos activos por si un evento en vivo no llegó. */
const CATCH_UP_MS = 60_000;

export function usePrintStationWatch() {
  const role = useAuth((s) => s.user?.role);
  const cfg = usePrintStation((s) => s.cfg);
  const settings = useSettings((s) => s.settings);
  const active = canPrint(role) && cfg.enabled && settings?.printer_mode !== "network";
  // El handler del socket se registra una sola vez: lee la configuración por referencia.
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const activeRef = useRef(active); activeRef.current = active;

  /** Imprime el pedido si le toca a este dispositivo (una sola vez, venga del evento o del repaso). */
  const consider = (order: Order) => {
    const c = cfgRef.current;
    if (!activeRef.current || !order?.items?.length) return;
    if (isLocalOrder(order)) return;                              // lo tomó este mismo dispositivo
    if (c.onlyWaiter && order.user_role !== "mesero") return;
    if (!c.kitchen && !c.ticket) return;
    if (!claimPrint(order)) return;
    if (c.kitchen) printOrder(order, { kitchen: true, silent: true });
    if (c.ticket) printOrder(order, { silent: true });
    toast.info(`Comanda #${order.daily_number} impresa`, order.user_name ? `Pedido de ${order.user_name}` : undefined);
  };

  useSocket({ "order:created": consider }, []);

  // Red de seguridad para una estación que queda abierta todo el día: si el evento en vivo no llegó
  // (corte de internet, Realtime sin configurar, pestaña dormida por el navegador), cada minuto se
  // repasan los pedidos activos y se imprime lo que falte. Solo cuenta lo creado desde que se encendió
  // la estación, así encenderla a media jornada no escupe el historial.
  useEffect(() => {
    if (!active) return;
    const since = Date.now();
    let alive = true;
    const catchUp = async () => {
      try {
        const orders = await api.get<Order[]>("/api/orders?active=1");
        if (!alive) return;
        orders
          .filter((o) => new Date(o.created_at).getTime() >= since)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .forEach(consider);
      } catch { /* sin conexión: el evento llegará al reconectar */ }
    };
    const h = setInterval(catchUp, CATCH_UP_MS);
    return () => { alive = false; clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/** Comanda de prueba: verifica de una vez impresora, tamaño de papel y el modo sin diálogo de Chrome. */
function testOrder(): Order {
  const at = new Date().toISOString();
  return {
    id: 0, code: "PRUEBA", daily_number: 0, type: "takeaway", customer_name: "PRUEBA", customer_phone: "", table_no: "",
    customer_address: "", customer_reference: "", status: "pending", payment_method: null, paid: false,
    subtotal: 0, discount: 0, tax: 0, total: 0, cash_received: null, notes: "Comanda de prueba · no preparar",
    user_id: 0, created_at: at, updated_at: at, paid_at: null, ready_at: null, delivered_at: null,
    refund_method: null, refund_amount: null, refunded_at: null,
    items: [{ product_id: null, name: "Comanda de prueba", emoji: "🧾", price: 0, qty: 1, notes: "" }],
  };
}

/** Botón de la barra lateral: abre los ajustes de impresión de ESTE dispositivo. */
export function PrintStationButton({ className = "", light = false }: { className?: string; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  const cfg = usePrintStation((s) => s.cfg);
  const set = usePrintStation((s) => s.set);
  const settings = useSettings((s) => s.settings);
  const network = settings?.printer_mode === "network";
  const on = cfg.enabled && !network;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative grid place-items-center transition ${light ? "text-white/55 hover:text-white" : "text-muted hover:text-ink"} ${className}`}
        title={on ? "Estación de impresión activa" : "Impresión automática"}
        aria-label="Impresión automática"
      >
        <Printer size={22} />
        {on && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-mint ring-2 ring-ink" />}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} width="max-w-md"
        title="Impresión automática"
        subtitle="Ajuste de esta computadora: imprime sola las comandas que llegan de los meseros."
        footer={<button className="btn-primary" onClick={() => setOpen(false)}>Listo</button>}>
        {network ? (
          <div className="rounded-2xl bg-mint-soft border border-mint/40 p-4">
            <div className="font-black text-sm flex items-center gap-2"><Wifi size={16} /> Impresora en red (ESC/POS)</div>
            <p className="text-sm font-semibold text-muted mt-1 leading-relaxed">
              El servidor imprime la comanda directamente en la impresora apenas el mesero envía el pedido. No hace falta
              configurar nada en este dispositivo (revisa que “Imprimir al crear pedido” esté activo en Ajustes → Impresora).
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-line p-4">
              <Toggle checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="Esta computadora imprime los pedidos que llegan" />
              <p className="text-xs font-semibold text-muted mt-2 leading-relaxed">
                Actívalo solo en la computadora conectada a la impresora. Si lo activas en dos, saldrán dos copias.
              </p>
            </div>
            <div className={`mt-4 flex flex-col gap-3.5 transition ${cfg.enabled ? "" : "opacity-40 pointer-events-none"}`}>
              <Toggle checked={cfg.kitchen} onChange={(v) => set({ kitchen: v })} label="Comanda de cocina" />
              <Toggle checked={cfg.ticket} onChange={(v) => set({ ticket: v })} label="Ticket del cliente" />
              <Toggle checked={cfg.onlyWaiter} onChange={(v) => set({ onlyWaiter: v })} label="Solo pedidos de meseros" />
            </div>
            <button className="btn-soft w-full mt-4" onClick={() => printOrder(testOrder(), { kitchen: true })}>
              <Printer size={16} /> Imprimir comanda de prueba
            </button>
            <div className="mt-4 rounded-2xl bg-cream p-4">
              <div className="flex gap-2 text-xs font-semibold text-muted leading-relaxed"><Check size={14} className="shrink-0 mt-0.5 text-mint-2" /> Deja el navegador abierto en esta computadora: cerrado no hay impresión. Si algún aviso no llega, cada minuto revisa los pedidos y saca las comandas que falten.</div>
              <div className="mt-3 pt-3 border-t border-line flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-black text-sm">Que no salga el diálogo de Windows</div>
                  <div className="text-xs font-semibold text-muted">Se configura una sola vez en esta computadora.</div>
                </div>
                <button className="btn-soft btn-sm shrink-0" onClick={() => setGuide(true)}><MonitorPlay size={15} /> Ver cómo</button>
              </div>
            </div>
          </>
        )}
      </Modal>
      <PrintSetupGuide open={guide} onClose={() => setGuide(false)} />
    </>
  );
}
