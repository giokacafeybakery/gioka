import { useEffect, useState } from "react";
import { Banknote, CreditCard, QrCode, CheckCircle2, Printer, Loader2, CloudOff, ReceiptText } from "lucide-react";
import { Modal } from "./ui";
import { printOrder } from "./Receipt";
import { payTable } from "@/lib/actions";
import { money, PAYMENT } from "@/lib/format";
import { itemLabel } from "@/lib/options";
import { accountItems, type TableAccount } from "@/lib/tables";
import type { Order, PaymentMethod } from "@/lib/types";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/toast";

const METHODS: [PaymentMethod, string, React.ReactNode][] = [
  ["cash", "Efectivo", <Banknote size={22} />],
  ["qr", "QR", <QrCode size={22} />],
  ["card", "Tarjeta", <CreditCard size={22} />],
];

/**
 * Cobrar la mesa: primero el resumen de todo lo que consumió (sumando las rondas), luego la forma de pago.
 * Al confirmar se cierran todas las cuentas abiertas de la mesa y la mesa desaparece del salón.
 */
export function ChargeTableModal({ account, onClose, onDone }: { account: TableAccount | null; onClose: () => void; onDone: (orders: Order[]) => void }) {
  const settings = useSettings((s) => s.settings);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ orders: Order[]; change: number; queued: boolean } | null>(null);

  useEffect(() => {
    if (!account) return;
    setMethod("cash"); setReceived(""); setBusy(false); setDone(null);
  }, [account?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!account) return null;

  const items = accountItems(account);
  const cash = Number(received);
  const change = method === "cash" && received && Number.isFinite(cash) ? +(cash - account.total).toFixed(2) : 0;
  const short = method === "cash" && !!received && change < 0;

  const submit = async () => {
    if (busy) return;
    if (short) return toast.warning("El monto recibido es menor al total");
    setBusy(true);
    try {
      const { result, queued } = await payTable(account.orders, method, method === "cash" && received ? cash : null);
      setDone({ orders: result, change: Math.max(0, change), queued });
      onDone(result);
      toast.success(`Mesa ${account.table} cobrada`, `${money(account.total)} · ${PAYMENT[method]}`);
      if (queued) toast.info("Guardado en este dispositivo", "El cobro se enviará al volver la conexión.");
    } catch (e) {
      toast.error("No se pudo cobrar la mesa", (e as Error).message);
      setBusy(false);
    }
  };

  const print = async () => { for (const o of done?.orders || []) await printOrder(o); };

  if (done) {
    return (
      <Modal open onClose={onClose} width="max-w-sm">
        <div className="text-center pt-2 anim-fade-up">
          <div className="mx-auto w-20 h-20 rounded-full bg-mint-soft text-mint-2 grid place-items-center anim-ring"><CheckCircle2 size={38} /></div>
          <h3 className="text-2xl font-black mt-4">Mesa {account.table} cerrada</h3>
          <p className="text-muted font-semibold mt-1">Cobrado {money(account.total)} · {PAYMENT[method]}</p>
          {done.change > 0 && <div className="mt-3 inline-block px-4 py-2 rounded-xl bg-butter-soft text-[#9a6b00] font-black">Cambio: {money(done.change)}</div>}
          {done.queued && <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-butter-soft text-[#9a6b00] text-xs font-extrabold"><CloudOff size={13} /> Se enviará al volver la conexión</div>}
          <div className="grid grid-cols-2 gap-2 mt-6">
            <button className="btn-soft" onClick={() => void print()}><Printer size={18} /> Ticket</button>
            <button className="btn-primary" onClick={onClose}>Listo</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={`Cobrar mesa ${account.table}`}
      subtitle={`${account.orders.length === 1 ? "1 pedido" : `${account.orders.length} pedidos`} · ${account.units} ${account.units === 1 ? "producto" : "productos"}${account.names ? ` · ${account.names}` : ""}`}
      width="max-w-md">
      <div className="space-y-4">
        {/* Resumen de consumo */}
        <section className="rounded-2xl border border-line bg-cream/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line/70 text-[12px] font-extrabold uppercase tracking-wider text-muted">
            <ReceiptText size={14} /> Resumen de la cuenta
          </div>
          <ul className="max-h-56 overflow-y-auto divide-y divide-line/60">
            {items.map((it) => (
              <li key={it.key} className="flex items-baseline gap-3 px-4 py-2">
                <span className="w-7 shrink-0 font-black text-peach-2">{it.qty}×</span>
                <span className="min-w-0 flex-1 font-bold text-[14px] leading-snug">{itemLabel(it)}</span>
                <span className="font-extrabold text-[14px] shrink-0">{money(it.price * it.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 border-t border-line/70 space-y-1 text-sm font-bold text-muted">
            <div className="flex justify-between"><span>Subtotal</span><span className="text-ink">{money(account.subtotal)}</span></div>
            {account.discount > 0 && <div className="flex justify-between"><span>Descuento</span><span className="text-berry">-{money(account.discount)}</span></div>}
            {account.tax > 0 && <div className="flex justify-between"><span>Impuesto ({settings?.tax_rate}%)</span><span className="text-ink">{money(account.tax)}</span></div>}
            <div className="flex justify-between items-baseline pt-1"><span className="text-ink font-black">Total</span><span className="text-2xl font-black text-ink">{money(account.total)}</span></div>
          </div>
        </section>

        {/* Forma de pago */}
        <div>
          <label className="label">Forma de pago</label>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(([value, label, icon]) => (
              <button key={value} disabled={busy} onClick={() => setMethod(value)}
                className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-extrabold text-sm transition disabled:opacity-50 ${method === value ? "border-peach bg-peach-soft text-peach-2" : "border-line hover:border-peach"}`}>
                {icon}{label}
              </button>
            ))}
          </div>
        </div>

        {method === "cash" && (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="label">Monto recibido</label>
              <input className="input text-lg font-black" type="number" inputMode="decimal" min={account.total} step="0.01" value={received}
                onChange={(e) => setReceived(e.target.value)} placeholder={money(account.total)} disabled={busy} />
            </div>
            <div className="w-32 shrink-0 text-right">
              <div className="label">Cambio</div>
              <div className={`text-xl font-black ${short ? "text-berry" : "text-mint-2"}`}>{short ? money(0) : money(change)}</div>
            </div>
          </div>
        )}
        {method === "cash" && (
          <div className="flex flex-wrap gap-2 -mt-1">
            <button className="chip bg-cream hover:bg-cream-2" onClick={() => setReceived(account.total.toFixed(2))}>Exacto</button>
            {[5, 10, 20, 50, 100].filter((n) => n > account.total).slice(0, 3).map((n) => (
              <button key={n} className="chip bg-cream hover:bg-cream-2" onClick={() => setReceived(String(n))}>{money(n)}</button>
            ))}
          </div>
        )}

        <button className="btn-primary btn-lg w-full" disabled={busy || short} onClick={() => void submit()}>
          {busy ? <><Loader2 size={20} className="animate-spin" /> Cobrando…</> : <>Cobrar {money(account.total)}</>}
        </button>
        <p className="text-center text-xs font-bold text-muted -mt-1">Al cobrar, la mesa se libera y el consumo queda registrado en la caja.</p>
      </div>
    </Modal>
  );
}
