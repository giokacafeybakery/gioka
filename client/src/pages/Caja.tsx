import { useEffect, useState } from "react";
import { Wallet, Lock, Unlock, Banknote, CreditCard, QrCode, Printer, Receipt, AlertCircle, Search } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Modal, Field, Stat, Empty, Loading } from "@/components/ui";
import { printOrder } from "@/components/Receipt";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/socket";
import { money, STATUS, TYPE, time, dateTime, PAYMENT } from "@/lib/format";
import type { CashSession, Order, PaymentMethod } from "@/lib/types";
import { toast } from "@/store/toast";
import { OpenCashModal, useCashSession, useCash } from "@/components/OpenCash";
import { useAuth } from "@/store/auth";

export default function Caja() {
  const me = useAuth((s) => s.user);
  const session = useCashSession();
  const [history, setHistory] = useState<CashSession[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [q, setQ] = useState("");
  const [payFor, setPayFor] = useState<Order | null>(null);
  const [cashReceived, setCashReceived] = useState("");

  const load = () => Promise.all([
    useCash.getState().load(),
    api.get<CashSession[]>("/api/cash/history").then(setHistory),
    api.get<Order[]>("/api/orders").then(setOrders),
  ]).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);
  useSocket({ "order:created": () => load(), "order:updated": () => load() });

  const canClose = !!session && (me?.role === "admin" || session.user_id === me?.id);
  const close = async () => {
    try { await api.post("/api/cash/close", { closing_amount: Number(amount || 0), notes }); useCash.getState().set(null); setCloseModal(false); setAmount(""); setNotes(""); toast.success("Caja cerrada"); load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const pay = async (o: Order, method: PaymentMethod) => {
    try { await api.post(`/api/orders/${o.id}/pay`, { payment_method: method, cash_received: method === "cash" && cashReceived ? Number(cashReceived) : null }); setPayFor(null); setCashReceived(""); toast.success(`Pedido #${o.daily_number} cobrado`); }
    catch (e) { toast.error((e as Error).message); }
  };

  const unpaid = orders.filter((o) => !o.paid && o.status !== "cancelled");
  const filtered = orders.filter((o) => { const s = q.trim().toLowerCase(); return !s || String(o.daily_number).includes(s) || o.customer_name.toLowerCase().includes(s) || o.code.toLowerCase().includes(s); });
  const todayRevenue = orders.filter((o) => o.paid && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);

  if (session === undefined) return <Loading />;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader title="Caja" subtitle={session ? `Abierta por ${session.user_name} · ${dateTime(session.opened_at)}` : "No hay una caja abierta"}>
        {session ? (canClose ? <button className="btn-dark" onClick={() => { setAmount(String(session.expected_cash.toFixed(2))); setCloseModal(true); }}><Lock size={18} /> Cerrar caja</button> : <span className="pill bg-butter-soft text-[#9a6b00]"><Lock size={12} /> Turno de {session.user_name}</span>)
          : <button className="btn-primary" onClick={() => setOpenModal(true)}><Unlock size={18} /> Abrir caja</button>}
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Ventas de hoy" value={money(todayRevenue)} sub={`${orders.filter((o) => o.paid).length} pedidos cobrados`} tone="ink" icon={<Wallet size={22} />} />
          <Stat label="Efectivo en caja" value={money(session ? session.expected_cash : 0)} sub={session ? `Apertura ${money(session.opening_amount)} + ventas ${money(session.totals.cash)}` : "Caja cerrada"} tone="mint" icon={<Banknote size={22} />} />
          <Stat label="Tarjeta / QR" value={money((session?.totals.card || 0) + (session?.totals.qr || 0))} sub={session ? `Tarjeta ${money(session.totals.card)} · QR ${money(session.totals.qr)}` : "—"} tone="sky" icon={<CreditCard size={22} />} />
          <Stat label="Por cobrar" value={money(unpaid.reduce((s, o) => s + o.total, 0))} sub={`${unpaid.length} pedidos sin pagar`} tone={unpaid.length ? "berry" : "peach"} icon={<AlertCircle size={22} />} />
        </div>

        {unpaid.length > 0 && (
          <section>
            <h2 className="font-black text-[17px] mb-2">Pendientes de cobro</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:-mx-6 md:px-6 pb-1">
              {unpaid.map((o) => (
                <div key={o.id} className="card p-3.5 min-w-[240px] shrink-0 border-berry/30">
                  <div className="flex justify-between items-baseline"><span className="font-black text-lg">#{o.daily_number} <span className="text-sm text-ink-3 font-extrabold">{o.customer_name}</span></span><span className="font-black">{money(o.total)}</span></div>
                  <div className="text-xs font-semibold text-muted truncate">{TYPE[o.type].label}{o.table_no && ` · Mesa ${o.table_no}`} · {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
                  <div className="mt-3 flex gap-2"><span className={`pill ${STATUS[o.status].soft} ${STATUS[o.status].text}`}>{STATUS[o.status].label}</span><button className="btn btn-sm btn-primary ml-auto" disabled={!session} onClick={() => setPayFor(o)}>Cobrar</button></div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="font-black text-[17px]">Pedidos de hoy</h2>
            <div className="relative ml-auto w-full max-w-xs"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input h-10 pl-9" placeholder="Buscar #, cliente o código" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          {filtered.length === 0 ? <Empty icon={<Receipt size={26} />} title="Sin pedidos" hint="Los pedidos de hoy aparecerán aquí." /> : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-cream text-[11px] uppercase tracking-wider text-muted font-extrabold"><tr><th className="text-left px-4 py-3">Pedido</th><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3 hidden md:table-cell">Cajero</th><th className="text-left px-4 py-3">Estado</th><th className="text-left px-4 py-3">Pago</th><th className="text-left px-4 py-3 hidden sm:table-cell">Hora</th><th className="text-right px-4 py-3">Total</th><th className="px-2 py-3" /></tr></thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id} className="border-t border-line hover:bg-cream/60">
                      <td className="px-4 py-2.5 font-black">#{o.daily_number} <span className="text-muted font-bold text-xs">{TYPE[o.type].short}{o.table_no && ` ${o.table_no}`}</span></td>
                      <td className="px-4 py-2.5 font-bold">{o.customer_name || "—"}</td>
                      <td className="px-4 py-2.5 font-semibold text-muted hidden md:table-cell">{o.user_name}</td>
                      <td className="px-4 py-2.5"><span className={`pill ${STATUS[o.status].soft} ${STATUS[o.status].text}`}>{STATUS[o.status].label}</span></td>
                      <td className="px-4 py-2.5">{o.paid ? <span className="font-bold text-ink-3">{PAYMENT[o.payment_method!]}</span> : o.status === "cancelled" ? <span className="text-muted">—</span> : <button className="pill bg-berry-soft text-berry hover:bg-berry hover:text-white" onClick={() => setPayFor(o)}>Cobrar</button>}</td>
                      <td className="px-4 py-2.5 font-bold text-muted hidden sm:table-cell">{time(o.created_at)}</td>
                      <td className={`px-4 py-2.5 text-right font-black ${o.status === "cancelled" ? "line-through text-muted" : ""}`}>{money(o.total)}</td>
                      <td className="px-2 py-2.5"><button className="btn-icon btn-ghost w-9 h-9" onClick={() => printOrder(o)} title="Reimprimir"><Printer size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {history.length > 0 && (
          <section>
            <h2 className="font-black text-[17px] mb-2">Cierres anteriores</h2>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-cream text-[11px] uppercase tracking-wider text-muted font-extrabold"><tr><th className="text-left px-4 py-3">Apertura</th><th className="text-left px-4 py-3">Cierre</th><th className="text-left px-4 py-3 hidden md:table-cell">Cajero</th><th className="text-right px-4 py-3">Ventas</th><th className="text-right px-4 py-3 hidden sm:table-cell">Esperado</th><th className="text-right px-4 py-3">Contado</th><th className="text-right px-4 py-3">Diferencia</th></tr></thead>
                <tbody>
                  {history.filter((s) => s.closed_at).map((s) => { const d = (s.closing_amount ?? 0) - (s.expected_amount ?? 0); return (
                    <tr key={s.id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-bold">{dateTime(s.opened_at)}</td><td className="px-4 py-2.5 font-bold">{dateTime(s.closed_at)}</td>
                      <td className="px-4 py-2.5 text-muted font-semibold hidden md:table-cell">{s.user_name}</td>
                      <td className="px-4 py-2.5 text-right font-black">{money(s.totals.revenue)}</td>
                      <td className="px-4 py-2.5 text-right font-bold hidden sm:table-cell">{money(s.expected_amount)}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{money(s.closing_amount)}</td>
                      <td className={`px-4 py-2.5 text-right font-black ${Math.abs(d) < 0.01 ? "text-mint-2" : "text-berry"}`}>{d >= 0 ? "+" : ""}{money(d)}</td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <OpenCashModal open={openModal} onClose={() => setOpenModal(false)} onOpened={() => load()} />

      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Cerrar caja" subtitle="Cuenta el efectivo y registra el cierre" width="max-w-sm"
        footer={<><button className="btn-ghost" onClick={() => setCloseModal(false)}>Cancelar</button><button className="btn-dark" onClick={close}>Cerrar caja</button></>}>
        {session && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-cream p-4 text-sm font-bold space-y-1.5">
              <div className="flex justify-between"><span className="text-muted">Apertura</span><span>{money(session.opening_amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Ventas en efectivo</span><span>{money(session.totals.cash)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Tarjeta</span><span>{money(session.totals.card)}</span></div>
              <div className="flex justify-between"><span className="text-muted">QR</span><span>{money(session.totals.qr)}</span></div>
              <div className="flex justify-between pt-2 border-t border-line font-black"><span>Efectivo esperado</span><span>{money(session.expected_cash)}</span></div>
            </div>
            <Field label="Efectivo contado"><input autoFocus className="input text-lg" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            {amount && <div className={`text-sm font-black ${Math.abs(Number(amount) - session.expected_cash) < 0.01 ? "text-mint-2" : "text-berry"}`}>Diferencia: {Number(amount) - session.expected_cash >= 0 ? "+" : ""}{money(Number(amount) - session.expected_cash)}</div>}
            <Field label="Notas"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={payFor ? `Cobrar pedido #${payFor.daily_number}` : ""} subtitle={payFor ? `Total ${money(payFor.total)}` : ""} width="max-w-sm">
        <Field label="Efectivo recibido (opcional)"><input className="input" type="number" inputMode="decimal" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="Para calcular el cambio" /></Field>
        {payFor && cashReceived && Number(cashReceived) >= payFor.total && <div className="text-sm font-black text-mint-2 mt-1">Cambio: {money(Number(cashReceived) - payFor.total)}</div>}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {([["cash", "Efectivo", <Banknote size={22} />], ["qr", "QR", <QrCode size={22} />], ["card", "Tarjeta", <CreditCard size={22} />]] as [PaymentMethod, string, React.ReactNode][]).map(([m, l, ic]) => (
            <button key={m} onClick={() => payFor && pay(payFor, m)} className="h-20 rounded-2xl border-2 border-line hover:border-peach hover:bg-peach-soft flex flex-col items-center justify-center gap-1 font-extrabold text-sm transition">{ic}{l}</button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
