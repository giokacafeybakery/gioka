import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UtensilsCrossed, Plus, Clock, Users, Printer, CloudOff, Wallet, ChevronRight, Search, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Modal, Empty, Loading } from "@/components/ui";
import { printOrder } from "@/components/Receipt";
import { ChargeTableModal } from "@/components/ChargeTableModal";
import { OpenCashModal, useCashSession } from "@/components/OpenCash";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/socket";
import { money, elapsed, time } from "@/lib/format";
import { itemLabel, optionsSummary } from "@/lib/options";
import { accountItems, accountRounds, tableAccounts, type TableAccount } from "@/lib/tables";
import { refOf, refPath } from "@/lib/offline/queue";
import type { Order } from "@/lib/types";
import { useCart } from "@/store/cart";
import { toast } from "@/store/toast";

/** Estado de la mesa de un vistazo: lo que falta por preparar manda sobre lo que ya salió. */
const STATE = {
  pending: { label: "En espera", chip: "bg-butter-soft text-[#9a6b00]", bar: "bg-butter", dot: "bg-butter" },
  preparing: { label: "En cocina", chip: "bg-sky-soft text-[#0f6f95]", bar: "bg-sky", dot: "bg-sky" },
  ready: { label: "Servido", chip: "bg-mint-soft text-mint-2", bar: "bg-mint", dot: "bg-mint" },
} as const;

export default function Mesas() {
  const nav = useNavigate();
  const cart = useCart();
  const cash = useCashSession();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  // Cobrar guarda la cuenta tal como estaba al abrirse: al cobrarla desaparece del salón y la pantalla
  // de confirmación seguiría dependiendo de una mesa que ya no existe.
  const [charging, setCharging] = useState<TableAccount | null>(null);
  const [openCash, setOpenCash] = useState(false);
  const [, tick] = useState(0);

  // El salón es una pizarra en vivo: se relee siempre del servidor (sin la caché corta de lecturas).
  const load = () => { api.clearCache(); return api.get<Order[]>("/api/orders?active=1").then(setOrders).catch(() => setOrders((o) => o || [])); };
  /** Aplica de inmediato los pedidos que devuelve una acción (cobro o ronda nueva), también sin conexión. */
  const applyOrders = (updated: Order[]) => setOrders((cur) => (cur || []).map((o) => updated.find((u) => u.id === o.id || (!!u.client_id && u.client_id === o.client_id)) || o));
  useEffect(() => { load(); const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  useSocket({
    "order:created": () => load(),
    "order:updated": () => load(),
    "sync:changed": () => load(),
  });

  const accounts = useMemo(() => tableAccounts(orders || []), [orders]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return accounts;
    return accounts.filter((a) => a.table.toLowerCase().includes(s) || a.names.toLowerCase().includes(s) || a.orders.some((o) => String(o.daily_number) === s));
  }, [accounts, q]);
  const find = (key: string | null) => (key ? accounts.find((a) => a.key === key) || null : null);
  const salon = +accounts.reduce((s, a) => s + a.total, 0).toFixed(2);

  const newTable = () => { cart.set({ type: "dinein" }); nav("/pos"); };
  /** Seguir pidiendo: se abre el PDV sobre el último pedido de la mesa, con la mesa y el nombre ya puestos. */
  const addProducts = (a: TableAccount) => {
    const order = a.orders.at(-1);
    if (order) nav(`/pos?agregar=${refPath(refOf(order))}`);
  };
  const printBill = async (a: TableAccount) => {
    toast.info("Imprimiendo la cuenta", `Mesa ${a.table} · ${money(a.total)}`);
    for (const o of a.orders) await printOrder(o);
  };

  const detailAccount = find(detail);
  const rounds = detailAccount ? accountRounds(detailAccount) : [];

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader title="Mesas" subtitle={accounts.length ? `${accounts.length} ${accounts.length === 1 ? "mesa ocupada" : "mesas ocupadas"} · ${money(salon)} en el salón` : "Las mesas con cuenta abierta aparecen aquí"}>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {accounts.length > 2 && (
            <div className="relative flex-1 sm:w-56">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-10 rounded-full" placeholder="Mesa o cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <button className="btn-primary shrink-0" onClick={newTable}><Plus size={18} /> Abrir mesa</button>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-24 lg:pb-6">
        {cash === null && (
          <div className="mb-4 rounded-2xl border border-butter/40 bg-butter-soft/60 px-4 py-3 flex flex-wrap items-center gap-3">
            <Wallet size={20} className="text-[#9a6b00]" />
            <p className="text-sm font-bold text-[#9a6b00] mr-auto">La caja está cerrada: puedes seguir tomando pedidos, pero no cobrar mesas.</p>
            <button className="btn btn-sm btn-dark" onClick={() => setOpenCash(true)}>Abrir caja</button>
          </div>
        )}

        {orders === null ? <Loading label="Cargando el salón…" /> : shown.length === 0 ? (
          <div className="pt-10">
            <Empty
              icon={<UtensilsCrossed size={26} />}
              title={accounts.length ? "Ninguna mesa coincide" : "No hay mesas ocupadas"}
              hint={accounts.length ? "Prueba con otro número de mesa o nombre." : "Cuando tomes un pedido en mesa, la cuenta se abrirá aquí y podrás seguir agregando productos hasta cobrarla."}
              action={!accounts.length && <button className="btn-primary" onClick={newTable}><Plus size={18} /> Abrir una mesa</button>}
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((a) => {
              const st = STATE[a.status];
              // El resumen de la tarjeta junta el mismo producto aunque venga de rondas distintas.
              const preview = accountItems(a);
              return (
                <article key={a.key} className="card relative overflow-hidden flex flex-col anim-fade-up hover:shadow-lift transition">
                  <span className={`absolute inset-y-0 left-0 w-1.5 ${st.bar}`} />
                  <button onClick={() => setDetail(a.key)} className="text-left pl-5 pr-4 pt-4 pb-3 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-ink text-white grid place-content-center shrink-0 shadow-soft">
                        <span className="block text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/50 text-center">Mesa</span>
                        <span className="block text-[22px] font-black leading-none text-center">{a.table}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`pill ${st.chip}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}</span>
                          {a.pending && <span className="pill bg-butter-soft text-[#9a6b00]" title="Sin sincronizar"><CloudOff size={11} /></span>}
                        </div>
                        <div className="mt-1.5 font-extrabold text-[15px] leading-tight truncate">{a.names || "Sin nombre"}</div>
                        <div className="mt-0.5 text-xs font-bold text-muted flex items-center gap-1.5 flex-wrap">
                          <Clock size={12} /> {elapsed(a.opened_at)}
                          <span className="text-line">·</span>
                          <Users size={12} /> {a.units} {a.units === 1 ? "producto" : "productos"}
                          {a.rounds > 1 && <><span className="text-line">·</span><span className="text-peach-2">{a.rounds} rondas</span></>}
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-muted shrink-0 mt-1" />
                    </div>

                    <ul className="mt-3 space-y-0.5 text-[13px] font-semibold text-ink-3">
                      {preview.slice(0, 3).map((it) => (
                        <li key={it.key} className="truncate"><span className="text-peach-2 font-black">{it.qty}×</span> {itemLabel(it)}</li>
                      ))}
                      {preview.length > 3 && <li className="text-muted font-bold">+{preview.length - 3} más…</li>}
                    </ul>
                  </button>

                  <div className="mt-auto flex items-end justify-between gap-3 pl-5 pr-4 py-3 border-t border-line/70 bg-cream/40">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Cuenta</div>
                      <div className="text-[22px] font-black leading-none mt-0.5">{money(a.total)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-soft" onClick={() => addProducts(a)}><Plus size={15} /> Productos</button>
                      <button className="btn btn-sm btn-dark px-4" disabled={cash === null} onClick={() => setCharging(a)} title={cash === null ? "Abre la caja para cobrar" : "Cobrar la mesa"}>Cobrar</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Detalle de la cuenta, ronda por ronda */}
      <Modal open={!!detailAccount} onClose={() => setDetail(null)} width="max-w-lg" flush>
        {detailAccount && (
          <div className="anim-fade-up">
            <header className="bg-ink text-white px-6 pt-6 pb-5 rounded-t-xl2">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/10 grid place-content-center shrink-0">
                  <span className="block text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/50 text-center">Mesa</span>
                  <span className="block text-2xl font-black leading-none text-center">{detailAccount.table}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-black leading-tight truncate">{detailAccount.names || "Cuenta abierta"}</h3>
                  <p className="text-sm font-bold text-white/60 mt-0.5">
                    Abierta a las {time(detailAccount.opened_at)} · {elapsed(detailAccount.opened_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {detailAccount.orders.map((o) => (
                      <span key={o.id} className="pill bg-white/10 text-white/80">#{o.daily_number} · {o.code}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/45">Total</div>
                  <div className="text-2xl font-black leading-none">{money(detailAccount.total)}</div>
                </div>
              </div>
            </header>

            <div className="max-h-[46vh] overflow-y-auto px-6 py-4">
              {rounds.map((r, i) => (
                <section key={`${r.order.id}-${r.round}`} className={i ? "mt-5" : ""}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <h4 className="font-black text-[15px]">{i === 0 ? "Primera ronda" : `Ronda ${i + 1}`}</h4>
                    <span className="text-xs font-bold text-muted">{time(r.at)}</span>
                    <div className="flex-1 border-b border-dashed border-line" />
                    <span className="font-extrabold text-sm">{money(r.total)}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {r.items.map((it, n) => {
                      const opts = optionsSummary(it.options);
                      return (
                        <li key={n} className="flex items-baseline gap-3">
                          <span className="w-7 shrink-0 font-black text-peach-2">{it.qty}×</span>
                          <span className="min-w-0 flex-1">
                            <span className="font-bold text-[14px]">{it.name}</span>
                            {opts && <span className="block text-xs font-bold text-ink-3">{opts}</span>}
                            {it.notes && <span className="block text-xs font-bold text-peach-2">{it.notes}</span>}
                          </span>
                          <span className="font-extrabold text-[14px] shrink-0">{money(it.price * it.qty)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-line bg-cream/50 rounded-b-xl2">
              <div className="space-y-1 text-sm font-bold text-muted mb-3">
                <div className="flex justify-between"><span>Subtotal</span><span className="text-ink">{money(detailAccount.subtotal)}</span></div>
                {detailAccount.discount > 0 && <div className="flex justify-between"><span>Descuento</span><span className="text-berry">-{money(detailAccount.discount)}</span></div>}
                {detailAccount.tax > 0 && <div className="flex justify-between"><span>Impuesto</span><span className="text-ink">{money(detailAccount.tax)}</span></div>}
                <div className="flex justify-between items-baseline pt-1"><span className="text-ink font-black">Total</span><span className="text-2xl font-black text-ink">{money(detailAccount.total)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-soft" onClick={() => addProducts(detailAccount)}><Plus size={18} /> Agregar productos</button>
                <button className="btn-primary" disabled={cash === null} onClick={() => { setCharging(detailAccount); setDetail(null); }}><ReceiptText size={18} /> Cobrar mesa</button>
              </div>
              <button className="btn-ghost w-full mt-2 text-sm" onClick={() => void printBill(detailAccount)}><Printer size={16} /> Imprimir la cuenta</button>
            </div>
          </div>
        )}
      </Modal>

      <ChargeTableModal account={charging} onClose={() => setCharging(null)} onDone={(paid) => { applyOrders(paid); void load(); }} />
      <OpenCashModal open={openCash} onClose={() => setOpenCash(false)} />
    </div>
  );
}
