import { useState } from "react";
import { Printer, Wifi, Check } from "lucide-react";
import { Modal, Toggle } from "./ui";
import { printOrder } from "./Receipt";
import { usePrintStation, isLocalOrder, claimPrint } from "@/lib/printStation";
import { useSocket } from "@/lib/socket";
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
export function usePrintStationWatch() {
  const role = useAuth((s) => s.user?.role);
  const cfg = usePrintStation((s) => s.cfg);
  const settings = useSettings((s) => s.settings);
  const active = canPrint(role) && cfg.enabled && settings?.printer_mode !== "network";

  useSocket({
    "order:created": (order: Order) => {
      if (!active || !order?.items?.length) return;
      if (isLocalOrder(order)) return;                              // lo tomó este mismo dispositivo
      if (cfg.onlyWaiter && order.user_role !== "mesero") return;
      if (!cfg.kitchen && !cfg.ticket) return;
      if (!claimPrint(order)) return;
      if (cfg.kitchen) printOrder(order, { kitchen: true, silent: true });
      if (cfg.ticket) printOrder(order, { silent: true });
      toast.info(`Comanda #${order.daily_number} impresa`, order.user_name ? `Pedido de ${order.user_name}` : undefined);
    },
  }, [active, cfg.kitchen, cfg.ticket, cfg.onlyWaiter]);
}

/** Botón de la barra lateral: abre los ajustes de impresión de ESTE dispositivo. */
export function PrintStationButton({ className = "", light = false }: { className?: string; light?: boolean }) {
  const [open, setOpen] = useState(false);
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
            <div className={`mt-3 space-y-3 transition ${cfg.enabled ? "" : "opacity-40 pointer-events-none"}`}>
              <Toggle checked={cfg.kitchen} onChange={(v) => set({ kitchen: v })} label="Comanda de cocina" />
              <Toggle checked={cfg.ticket} onChange={(v) => set({ ticket: v })} label="Ticket del cliente" />
              <Toggle checked={cfg.onlyWaiter} onChange={(v) => set({ onlyWaiter: v })} label="Solo pedidos de meseros" />
            </div>
            <div className="mt-4 text-xs font-semibold text-muted leading-relaxed">
              <div className="flex gap-2"><Check size={14} className="shrink-0 mt-0.5 text-mint-2" /> Deja esta pantalla abierta: con el navegador cerrado no hay impresión.</div>
              <div className="flex gap-2 mt-1"><Check size={14} className="shrink-0 mt-0.5 text-mint-2" /> Para que no aparezca el diálogo de Windows, abre Chrome con <span className="font-mono">--kiosk-printing</span>.</div>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
