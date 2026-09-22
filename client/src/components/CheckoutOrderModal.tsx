import { useEffect, useState } from "react";
import { Banknote, CreditCard, QrCode } from "lucide-react";
import { Modal, Field } from "./ui";
import { printOrder } from "./Receipt";
import { checkoutOrder } from "@/lib/actions";
import { money } from "@/lib/format";
import type { Order, PaymentMethod } from "@/lib/types";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/toast";

export function CheckoutOrderModal({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: (order: Order) => void }) {
  const [name, setName] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    setName(order.customer_name || "");
    setMethod("cash");
    setReceived("");
    setBusy(false);
  }, [order]);

  const submit = async () => {
    if (!order || busy) return;
    if (!name.trim()) return toast.warning("Indica el nombre del cliente");
    const cashReceived = method === "cash" ? Number(received) : null;
    if (method === "cash" && (!received || !Number.isFinite(cashReceived) || cashReceived! < order.total)) return toast.warning("El monto recibido es menor al total");
    setBusy(true);
    try {
      const result = await checkoutOrder(order, name, method, cashReceived);
      if (!useSettings.getState().settings) await useSettings.getState().load().catch(() => undefined);
      if (useSettings.getState().settings?.printer_mode === "browser") printOrder(result);
      onDone(result);
      onClose();
      toast.success(`Pedido #${order.daily_number} cobrado y entregado`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal open={!!order} onClose={onClose} title={order ? `Cobrar y entregar #${order.daily_number}` : ""} subtitle={order ? `Total ${money(order.total)}` : ""} width="max-w-sm">
      <div className="space-y-4">
        <Field label="Nombre del cliente"><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de quien recibe" /></Field>
        <div><label className="label">Forma de pago</label><div className="grid grid-cols-3 gap-2">
          {([["cash", "Efectivo", <Banknote size={22} />], ["qr", "QR", <QrCode size={22} />], ["card", "Tarjeta", <CreditCard size={22} />]] as [PaymentMethod, string, React.ReactNode][]).map(([value, label, icon]) => (
            <button key={value} disabled={busy} onClick={() => setMethod(value)} className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-extrabold text-sm transition disabled:opacity-50 ${method === value ? "border-peach bg-peach-soft text-peach-2" : "border-line hover:border-peach"}`}>{icon}{label}</button>
          ))}
        </div></div>
        {method === "cash" && <Field label="Monto recibido"><input className="input text-lg font-black" type="number" inputMode="decimal" min={order?.total || 0} step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={order ? money(order.total) : "0.00"} /></Field>}
        {method === "cash" && order && Number(received) >= order.total && <div className="rounded-xl bg-mint-soft text-mint-2 px-3 py-2 flex justify-between font-extrabold"><span>Cambio</span><span>{money(Number(received) - order.total)}</span></div>}
        <button className="btn-primary btn-lg w-full" disabled={busy} onClick={() => void submit()}>{busy ? "Procesando…" : "Cobrar, entregar e imprimir"}</button>
      </div>
    </Modal>
  );
}
