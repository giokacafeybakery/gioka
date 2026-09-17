import { useEffect, useRef, useState } from "react";
import { ShoppingBag, Bike, UtensilsCrossed, Clock, CheckCircle2, Undo2, XCircle, Printer, Volume2, VolumeX, History, Banknote, CreditCard, QrCode } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Modal, Empty, Segmented, Confirm } from "@/components/ui";
import { printOrder } from "@/components/Receipt";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/socket";
import { money, STATUS, TYPE, elapsed, time, PAYMENT } from "@/lib/format";
import type { Order, OrderStatus, OrderType, PaymentMethod } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";

const TYPE_ICON: Record<OrderType, React.ReactNode> = { takeaway: <ShoppingBag size={14} />, delivery: <Bike size={14} />, dinein: <UtensilsCrossed size={14} /> };

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start();
    o.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
    o.stop(ctx.currentTime + 0.28);
  } catch { /* no audio */ }
}

export default function Pedidos() {
  const user = useAuth((s) => s.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [view, setView] = useState<"board" | "history">("board");
  const [sound, setSound] = useState(() => localStorage.getItem("gioka-sound") !== "0");
  const [detail, setDetail] = useState<Order | null>(null);
  const [cancel, setCancel] = useState<Order | null>(null);
  const [payFor, setPayFor] = useState<Order | null>(null);
  const [, tick] = useState(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const load = () => api.get<Order[]>("/api/orders").then(setOrders).catch(() => {});
  useEffect(() => { load(); const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  useSocket({
    "order:created": (o: Order) => { setOrders((s) => [o, ...s.filter((x) => x.id !== o.id)]); if (soundRef.current) beep(); },
    "order:updated": (o: Order) => setOrders((s) => s.map((x) => (x.id === o.id ? o : x))),
  });
  useEffect(() => localStorage.setItem("gioka-sound", sound ? "1" : "0"), [sound]);

  const setStatus = async (o: Order, status: OrderStatus) => {
    try { await api.patch(`/api/orders/${o.id}/status`, { status }); if (detail?.id === o.id) setDetail(null); }
    catch (e) { toast.error((e as Error).message); }
  };
  const pay = async (o: Order, method: PaymentMethod) => {
    try { await api.post(`/api/orders/${o.id}/pay`, { payment_method: method }); setPayFor(null); toast.success(`Pedido #${o.daily_number} cobrado`); }
    catch (e) { toast.error((e as Error).message); }
  };

  const cols: { status: OrderStatus; hint: string }[] = [
    { status: "pending", hint: "Por preparar" }, { status: "preparing", hint: "En cocina" }, { status: "ready", hint: "Para entregar" },
  ];
  const history = orders.filter((o) => o.status === "delivered" || o.status === "cancelled");
  const canManage = user?.role !== "cocina";

  const Card = ({ o }: { o: Order }) => {
    const st = STATUS[o.status];
    const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
    const late = o.status !== "ready" && mins >= 15;
    return (
      <div className={`card p-4 anim-fade-up cursor-pointer hover:shadow-lift transition ${late ? "ring-2 ring-berry/50" : ""}`} onClick={() => setDetail(o)}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-2xl font-black leading-none">#{o.daily_number}</div>
            <div className="text-xs font-extrabold text-muted mt-1 flex items-center gap-1.5">{TYPE_ICON[o.type]}{TYPE[o.type].label}{o.table_no && ` · Mesa ${o.table_no}`}</div>
          </div>
          <div className="text-right">
            <div className={`pill ${late ? "bg-berry-soft text-berry" : st.soft + " " + st.text}`}><Clock size={12} />{elapsed(o.created_at)}</div>
            {o.customer_name && <div className="text-sm font-extrabold mt-1 truncate max-w-[120px]">{o.customer_name}</div>}
          </div>
        </div>
        <ul className="mt-3 space-y-1">
          {o.items.map((it, i) => (
            <li key={i} className="flex gap-2 text-[15px] leading-snug">
              <span className="font-black w-7 shrink-0 text-peach-2">{it.qty}×</span>
              <span className="font-bold">{it.name}{it.notes && <span className="block text-xs text-berry font-extrabold">» {it.notes}</span>}</span>
            </li>
          ))}
        </ul>
        {o.notes && <div className="mt-2 text-xs font-extrabold text-berry bg-berry-soft rounded-lg px-2 py-1">Nota: {o.notes}</div>}
        <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {!o.paid && <span className="pill bg-berry-soft text-berry">Sin pagar</span>}
          <div className="flex-1" />
          {o.status === "pending" && <button className="btn btn-sm bg-sky text-white hover:brightness-95" onClick={() => setStatus(o, "preparing")}>Preparar</button>}
          {o.status === "preparing" && <button className="btn btn-sm btn-mint" onClick={() => setStatus(o, "ready")}><CheckCircle2 size={16} /> Listo</button>}
          {o.status === "ready" && canManage && (o.paid ? <button className="btn btn-sm btn-dark" onClick={() => setStatus(o, "delivered")}>Entregar</button> : <button className="btn btn-sm btn-primary" onClick={() => setPayFor(o)}><Banknote size={16} /> Cobrar</button>)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader title="Pedidos" subtitle={`${orders.filter((o) => ["pending", "preparing", "ready"].includes(o.status)).length} en curso · ${history.filter((o) => o.status === "delivered").length} entregados hoy`}>
        <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Tablero" }, { value: "history", label: <span className="flex items-center gap-1"><History size={14} /> Historial</span> }]} />
        <button className={`btn-icon ${sound ? "btn-soft" : "btn-ghost text-muted"}`} onClick={() => setSound(!sound)} title="Sonido de nuevos pedidos">{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
      </PageHeader>

      {view === "board" ? (
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 md:px-6 pb-4">
          <div className="grid grid-flow-col auto-cols-[minmax(300px,1fr)] md:grid-cols-3 gap-4 h-full min-w-max md:min-w-0">
            {cols.map((c) => {
              const list = orders.filter((o) => o.status === c.status).sort((a, b) => a.created_at.localeCompare(b.created_at));
              const st = STATUS[c.status];
              return (
                <div key={c.status} className="flex flex-col min-h-0 rounded-3xl bg-cream-2/60 p-3">
                  <div className="flex items-center gap-2 px-2 pb-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${st.color}`} />
                    <h2 className="font-black text-[15px]">{st.label}</h2>
                    <span className="text-xs font-bold text-muted">{c.hint}</span>
                    <span className="ml-auto min-w-7 h-7 px-2 rounded-full bg-paper text-sm font-black grid place-items-center">{list.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
                    {list.length === 0 ? <div className="text-center text-sm font-bold text-muted py-10">Nada por aquí</div> : list.map((o) => <Card key={o.id} o={o} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6">
          {history.length === 0 ? <Empty title="Sin historial hoy" hint="Los pedidos entregados y cancelados aparecerán aquí." /> : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-cream text-[11px] uppercase tracking-wider text-muted font-extrabold"><tr><th className="text-left px-4 py-3">Pedido</th><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3 hidden md:table-cell">Artículos</th><th className="text-left px-4 py-3">Estado</th><th className="text-left px-4 py-3 hidden sm:table-cell">Hora</th><th className="text-right px-4 py-3">Total</th></tr></thead>
                <tbody>
                  {history.map((o) => (
                    <tr key={o.id} className="border-t border-line hover:bg-cream/60 cursor-pointer" onClick={() => setDetail(o)}>
                      <td className="px-4 py-3 font-black">#{o.daily_number} <span className="text-muted font-bold text-xs">{TYPE[o.type].short}</span></td>
                      <td className="px-4 py-3 font-bold">{o.customer_name || "—"}</td>
                      <td className="px-4 py-3 text-muted font-semibold hidden md:table-cell truncate max-w-xs">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</td>
                      <td className="px-4 py-3"><span className={`pill ${STATUS[o.status].soft} ${STATUS[o.status].text}`}>{STATUS[o.status].label}</span></td>
                      <td className="px-4 py-3 font-bold text-muted hidden sm:table-cell">{time(o.created_at)}</td>
                      <td className="px-4 py-3 text-right font-black">{money(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Pedido #${detail.daily_number}` : ""} subtitle={detail ? `${TYPE[detail.type].label}${detail.table_no ? ` · Mesa ${detail.table_no}` : ""} · ${time(detail.created_at)} · ${detail.user_name || ""}` : ""}
        footer={detail && (
          <>
            {canManage && detail.status !== "cancelled" && detail.status !== "delivered" && <button className="btn-danger mr-auto" onClick={() => { setCancel(detail); }}><XCircle size={18} /> Cancelar</button>}
            {canManage && <button className="btn-soft" onClick={() => printOrder(detail)}><Printer size={18} /> Ticket</button>}
            <button className="btn-soft" onClick={() => printOrder(detail, { kitchen: true })}><Printer size={18} /> Comanda</button>
            {detail.status === "preparing" && <button className="btn-soft" onClick={() => setStatus(detail, "pending")}><Undo2 size={18} /> Volver</button>}
            {detail.status === "ready" && <button className="btn-soft" onClick={() => setStatus(detail, "preparing")}><Undo2 size={18} /> Volver</button>}
            {detail.status === "pending" && <button className="btn bg-sky text-white" onClick={() => setStatus(detail, "preparing")}>Preparar</button>}
            {detail.status === "preparing" && <button className="btn-mint" onClick={() => setStatus(detail, "ready")}>Listo</button>}
            {detail.status === "ready" && canManage && (detail.paid ? <button className="btn-dark" onClick={() => setStatus(detail, "delivered")}>Entregar</button> : <button className="btn-primary" onClick={() => setPayFor(detail)}>Cobrar</button>)}
          </>
        )}>
        {detail && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`pill ${STATUS[detail.status].soft} ${STATUS[detail.status].text}`}>{STATUS[detail.status].label}</span>
              <span className={`pill ${detail.paid ? "bg-mint-soft text-mint-2" : "bg-berry-soft text-berry"}`}>{detail.paid ? `Pagado · ${PAYMENT[detail.payment_method!]}` : "Sin pagar"}</span>
              <span className="pill bg-cream text-ink-3">{detail.code}</span>
            </div>
            {detail.customer_name && <div className="font-extrabold mb-3">👤 {detail.customer_name}{detail.customer_phone && <span className="text-muted font-bold"> · {detail.customer_phone}</span>}</div>}
            <ul className="divide-y divide-line">
              {detail.items.map((it, i) => (
                <li key={i} className="py-2 flex justify-between gap-3"><span className="font-bold"><span className="text-peach-2 font-black mr-2">{it.qty}×</span>{it.name}{it.notes && <span className="block text-xs text-berry font-extrabold">» {it.notes}</span>}</span><span className="font-black">{money(it.qty * it.price)}</span></li>
              ))}
            </ul>
            <div className="mt-3 pt-3 border-t border-line flex justify-between items-baseline"><span className="font-black">Total</span><span className="text-2xl font-black">{money(detail.total)}</span></div>
            {detail.notes && <div className="mt-3 text-sm font-bold bg-butter-soft text-[#9a6b00] rounded-xl px-3 py-2">Nota: {detail.notes}</div>}
          </div>
        )}
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={payFor ? `Cobrar pedido #${payFor.daily_number}` : ""} subtitle={payFor ? `Total ${money(payFor.total)}` : ""} width="max-w-sm">
        <div className="grid grid-cols-3 gap-2">
          {([["cash", "Efectivo", <Banknote size={22} />], ["qr", "QR", <QrCode size={22} />], ["card", "Tarjeta", <CreditCard size={22} />]] as [PaymentMethod, string, React.ReactNode][]).map(([m, l, ic]) => (
            <button key={m} onClick={() => payFor && pay(payFor, m)} className="h-20 rounded-2xl border-2 border-line hover:border-peach hover:bg-peach-soft flex flex-col items-center justify-center gap-1 font-extrabold text-sm transition">{ic}{l}</button>
          ))}
        </div>
      </Modal>

      <Confirm open={!!cancel} onClose={() => setCancel(null)} danger confirmLabel="Cancelar pedido" title={cancel ? `¿Cancelar el pedido #${cancel.daily_number}?` : ""} message="Se devolverá el stock de los productos. Esta acción no se puede deshacer." onConfirm={() => cancel && setStatus(cancel, "cancelled")} />
    </div>
  );
}
