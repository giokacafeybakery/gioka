import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Minus, Trash2, ShoppingBag, Bike, UtensilsCrossed, Banknote, CreditCard, QrCode, Printer, ChefHat, X, StickyNote, Percent, ChevronRight, Sparkles } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/AppShell";
import { Modal, Field, ProductThumb, Empty, Loading } from "@/components/ui";
import { printOrder } from "@/components/Receipt";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/socket";
import { money, greeting, STATUS, TYPE, elapsed } from "@/lib/format";
import type { Category, Order, OrderStatus, OrderType, PaymentMethod, Product } from "@/lib/types";
import { useCart, cartTotals, customerError } from "@/store/cart";
import { useSettings } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";
import { OpenCashModal, useCashSession, CashClosedNotice } from "@/components/OpenCash";

const TYPE_ICON: Record<OrderType, React.ReactNode> = { takeaway: <ShoppingBag size={16} />, delivery: <Bike size={16} />, dinein: <UtensilsCrossed size={16} /> };
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  pending: { to: "preparing", label: "Preparar" }, preparing: { to: "ready", label: "Listo" }, ready: { to: "delivered", label: "Entregar" },
};

export default function Pos() {
  const user = useAuth((s) => s.user);
  const settings = useSettings((s) => s.settings);
  const cart = useCart();
  const [cats, setCats] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [active, setActive] = useState<Order[]>([]);
  const [cat, setCat] = useState<number | "all">("all");
  const [q, setQ] = useState("");
  const [payment, setPayment] = useState<PaymentMethod | null>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Order | null>(null);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [mobileCart, setMobileCart] = useState(false);
  const [openCash, setOpenCash] = useState(false);
  const cash = useCashSession();

  const loadProducts = () => api.get<Product[]>("/api/products").then(setProducts);
  const loadActive = () => api.get<Order[]>("/api/orders?active=1").then(setActive);
  useEffect(() => { api.get<Category[]>("/api/categories").then(setCats); loadProducts(); loadActive(); }, []);
  useSocket({
    "order:created": () => loadActive(),
    "order:updated": () => loadActive(),
    "stock:updated": () => loadProducts(),
    "stock:low": () => loadProducts(),
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (products || []).filter((p) => (cat === "all" || p.category_id === cat) && (!s || p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s)));
  }, [products, cat, q]);

  const totals = cartTotals(cart.lines, cart.discount, settings?.tax_rate || 0);
  const qtyOf = (id: number) => cart.lines.find((l) => l.product.id === id)?.qty || 0;
  const change = payment === "cash" && cashReceived ? Number(cashReceived) - totals.total : 0;

  const submit = async (payNow: boolean) => {
    if (!cart.lines.length) return toast.warning("El pedido está vacío");
    const missing = customerError(cart.type, cart);
    if (missing) { setMobileCart(true); return toast.warning(missing); }
    if (payNow && payment === "cash" && cashReceived && Number(cashReceived) < totals.total) return toast.warning("El monto recibido es menor al total");
    setBusy(true);
    try {
      const order = await api.post<Order>("/api/orders", {
        type: cart.type, customer_name: cart.customerName.trim(), customer_phone: cart.customerPhone.trim(), table_no: cart.tableNo.trim(),
        customer_address: cart.address.trim(), customer_reference: cart.reference.trim(), notes: cart.notes, discount: cart.discount,
        payment_method: payNow ? payment : null, cash_received: payNow && payment === "cash" && cashReceived ? Number(cashReceived) : null,
        items: cart.lines.map((l) => ({ product_id: l.product.id, qty: l.qty, notes: l.notes })),
      });
      cart.clear(); setCashReceived(""); setMobileCart(false);
      setDone(order);
      if (settings?.auto_print && settings.printer_mode === "browser") printOrder(order, { silent: true });
      loadProducts();
    } catch (e) { toast.error("No se pudo crear el pedido", (e as Error).message); }
    finally { setBusy(false); }
  };

  const advance = async (o: Order) => {
    const n = NEXT[o.status]; if (!n) return;
    try { await api.patch(`/api/orders/${o.id}/status`, { status: n.to }); } catch (e) { toast.error((e as Error).message); }
  };

  const OrderPanel = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div><h2 className="text-xl font-black tracking-tight">Pedido actual</h2><p className="text-xs font-bold text-muted">{totals.count} {totals.count === 1 ? "artículo" : "artículos"}</p></div>
        <div className="flex gap-1">
          {cart.lines.length > 0 && <button className="btn-icon btn-ghost text-berry" onClick={() => cart.clear()} title="Vaciar"><Trash2 size={18} /></button>}
          <button className="btn-icon btn-ghost lg:hidden" onClick={() => setMobileCart(false)}><X size={20} /></button>
        </div>
      </div>

      <div className="px-5 pb-3">
        <div className="grid grid-cols-3 gap-1.5 bg-cream rounded-xl p-1">
          {(["takeaway", "delivery", "dinein"] as OrderType[]).map((t) => (
            <button key={t} onClick={() => cart.set({ type: t })} className={`h-10 rounded-lg text-[13px] font-extrabold flex items-center justify-center gap-1.5 transition ${cart.type === t ? "bg-paper shadow-soft text-ink" : "text-muted hover:text-ink"}`}>{TYPE_ICON[t]}{TYPE[t].short}</button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 mt-2">
          <input className="input h-10" placeholder={cart.type === "dinein" ? "Nombre (opcional)" : "Nombre del cliente *"} value={cart.customerName} onChange={(e) => cart.set({ customerName: e.target.value })} />
          {cart.type === "dinein" ? (
            <input className="input h-10 w-20 text-center" placeholder="Mesa *" value={cart.tableNo} onChange={(e) => cart.set({ tableNo: e.target.value })} />
          ) : cart.type === "delivery" ? (
            <input className="input h-10 w-32" placeholder="Teléfono *" inputMode="tel" value={cart.customerPhone} onChange={(e) => cart.set({ customerPhone: e.target.value })} />
          ) : null}
        </div>
        {cart.type === "delivery" && (
          <div className="mt-2 flex flex-col gap-2">
            <input className="input h-10" placeholder="Dirección de entrega *" value={cart.address} onChange={(e) => cart.set({ address: e.target.value })} />
            <input className="input h-10" placeholder="Punto de referencia *" value={cart.reference} onChange={(e) => cart.set({ reference: e.target.value })} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 min-h-0">
        {cart.lines.length === 0 ? (
          <Empty icon={<ShoppingBag size={26} />} title="Sin productos" hint="Toca un producto del menú para agregarlo al pedido." />
        ) : (
          <ul className="flex flex-col gap-2">
            {cart.lines.map((l) => (
              <li key={l.product.id} className="flex items-center gap-3 p-2 rounded-2xl bg-cream/70 anim-fade-up">
                <ProductThumb emoji={l.product.emoji} image={l.product.image} color={l.product.category_color} size={48} rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-[14px] leading-tight truncate">{l.product.name}</div>
                  <div className="text-xs font-bold text-muted">{money(l.product.price)} × {l.qty}{l.notes && <span className="text-peach-2"> · {l.notes}</span>}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="font-black text-[14px]">{money(l.product.price * l.qty)}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setNoteFor(l.product.id)} className="w-7 h-7 rounded-lg grid place-items-center text-muted hover:bg-paper hover:text-peach-2" title="Nota"><StickyNote size={14} /></button>
                    <button onClick={() => cart.setQty(l.product.id, l.qty - 1)} className="w-7 h-7 rounded-lg bg-paper grid place-items-center hover:bg-line"><Minus size={14} /></button>
                    <span className="w-5 text-center font-black text-sm">{l.qty}</span>
                    <button onClick={() => cart.setQty(l.product.id, l.qty + 1)} className="w-7 h-7 rounded-lg bg-ink text-white grid place-items-center hover:bg-ink-2"><Plus size={14} /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line px-5 pt-4 pb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-black text-[15px]">Pago</h3>
          <button className="text-xs font-extrabold text-peach-2 flex items-center gap-1 hover:underline" onClick={() => setShowDiscount(true)}><Percent size={12} /> Descuento{cart.discount > 0 && `: ${money(cart.discount)}`}</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {([["cash", "Efectivo", <Banknote size={20} />], ["qr", "QR", <QrCode size={20} />], ["card", "Tarjeta", <CreditCard size={20} />]] as [PaymentMethod, string, React.ReactNode][]).map(([m, label, icon]) => (
            <button key={m} onClick={() => setPayment(m)} className={`h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-xs font-extrabold transition ${payment === m ? "border-peach bg-peach-soft text-peach-2" : "border-line bg-paper text-muted hover:border-ink/20"}`}>{icon}{label}</button>
          ))}
        </div>
        {payment === "cash" && (
          <div className="flex items-center gap-2 mb-3">
            <input className="input h-10" type="number" inputMode="decimal" placeholder="Monto recibido" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} />
            <div className="text-right shrink-0 w-28"><div className="text-[11px] font-extrabold uppercase text-muted">Cambio</div><div className={`font-black ${change < 0 ? "text-berry" : "text-mint-2"}`}>{money(Math.max(0, change))}</div></div>
          </div>
        )}
        {payment === "qr" && totals.total > 0 && (
          <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-cream">
            <QRCodeSVG value={`GIOKA|${settings?.business_name}|${totals.total.toFixed(2)}`} size={64} bgColor="transparent" />
            <div className="text-xs font-bold text-muted">Muestra el QR al cliente para pagar con su app. Configura tu QR real en Administración.</div>
          </div>
        )}
        <div className="space-y-1 text-sm font-bold text-muted">
          <div className="flex justify-between"><span>Subtotal</span><span className="text-ink">{money(totals.subtotal)}</span></div>
          {totals.discount > 0 && <div className="flex justify-between"><span>Descuento</span><span className="text-berry">-{money(totals.discount)}</span></div>}
          {totals.tax > 0 && <div className="flex justify-between"><span>Impuesto ({settings?.tax_rate}%)</span><span className="text-ink">{money(totals.tax)}</span></div>}
          <div className="flex justify-between items-baseline pt-1"><span className="text-ink font-black">Total</span><span className="text-2xl font-black text-ink">{money(totals.total)}</span></div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 mt-3">
          <button className="btn-primary btn-lg" disabled={busy || !cart.lines.length || !cash} onClick={() => submit(true)}>Cobrar {money(totals.total)}<ChevronRight size={18} /></button>
          <button className="btn-soft btn-lg px-4" disabled={busy || !cart.lines.length || !cash} onClick={() => submit(false)} title="Enviar a cocina y cobrar después"><ChefHat size={20} /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col">
        <PageHeader title={<>{greeting()}, {user?.name.split(" ")[0]} <span className="anim-wiggle inline-block">👋</span></>} subtitle="Gestiona los pedidos de tus clientes fácilmente.">
          <div className="relative w-full sm:w-72">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-10 rounded-full" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </PageHeader>

        {cash === null ? <CashClosedNotice onOpen={() => setOpenCash(true)} /> : (
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-24 lg:pb-6">
          {/* Active orders */}
          <section className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-black text-[17px]">Pedidos activos <span className="text-muted text-sm font-bold">({active.length})</span></h2>
            </div>
            {active.length === 0 ? (
              <div className="card p-4 text-sm font-semibold text-muted flex items-center gap-3"><Sparkles size={18} className="text-peach" /> No hay pedidos en curso. ¡Todo al día!</div>
            ) : (
              <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:-mx-6 md:px-6 pb-1">
                {active.map((o) => {
                  // Cajero only hands the order over once the kitchen marks it ready; admin can push it through every step.
                  const st = STATUS[o.status]; const n = user?.role === "admin" || o.status === "ready" ? NEXT[o.status] : undefined;
                  return (
                    <div key={o.id} className="card p-3.5 w-[268px] shrink-0 anim-fade-up">
                      <div className="flex items-center justify-between text-xs font-extrabold text-muted"><span className="flex items-center gap-1.5">{TYPE_ICON[o.type]}{TYPE[o.type].label}{o.table_no && ` · ${o.table_no}`}</span><span>{elapsed(o.created_at)}</span></div>
                      <div className="mt-1 flex items-baseline justify-between"><div className="font-black text-lg truncate">#{o.daily_number} {o.customer_name && <span className="text-[15px] font-extrabold text-ink-3">{o.customer_name}</span>}</div><div className="font-black text-sm">{money(o.total)}</div></div>
                      <div className="text-xs font-semibold text-muted truncate">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
                      <div className="mt-3 flex items-center gap-1.5 min-w-0">
                        <span className={`pill ${st.soft} ${st.text}`}><span className={`w-1.5 h-1.5 rounded-full ${st.color}`} />{st.label}</span>
                        {!o.paid && <span className="pill bg-berry-soft text-berry">Sin pagar</span>}
                        <div className="flex-1" />
                        {n && <button onClick={() => advance(o)} className="btn btn-sm btn-dark shrink-0">{n.label}</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Menu */}
          <section>
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="font-black text-[17px]">Menú</h2>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                <button onClick={() => setCat("all")} className={`chip ${cat === "all" ? "bg-ink text-white" : "bg-paper border border-line text-ink-3 hover:bg-cream-2"}`}>🍽️ Todo</button>
                {cats.map((c) => (
                  <button key={c.id} onClick={() => setCat(c.id)} className={`chip ${cat === c.id ? "text-white" : "bg-paper border border-line text-ink-3 hover:bg-cream-2"}`} style={cat === c.id ? { background: c.color } : undefined}>{c.emoji} {c.name}</button>
                ))}
              </div>
            </div>
            {!products ? <Loading /> : filtered.length === 0 ? <Empty title="Sin resultados" hint="Prueba con otra búsqueda o categoría." /> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {filtered.map((p) => {
                  const qty = qtyOf(p.id); const out = p.track_stock && p.stock <= 0; const low = p.track_stock && !out && p.stock <= p.min_stock;
                  return (
                    <div key={p.id} className={`card overflow-hidden flex flex-col transition hover:shadow-lift ${out ? "opacity-60" : ""}`}>
                      <button disabled={out} onClick={() => cart.add(p)} className="relative text-left cursor-pointer disabled:cursor-not-allowed">
                        {p.image ? <img src={p.image} alt="" className="w-full aspect-[4/3] object-cover" /> : (
                          <div className="w-full aspect-[4/3] grid place-items-center" style={{ background: `linear-gradient(145deg, ${p.category_color || "#F2915A"}2e, ${p.category_color || "#F2915A"}66)` }}>
                            <span className="text-6xl drop-shadow-md select-none">{p.emoji}</span>
                          </div>
                        )}
                        {p.track_stock && (
                          <span className={`absolute top-2 left-2 pill ${out ? "bg-berry text-white" : low ? "bg-butter text-ink" : "bg-paper/90 text-ink-3"}`}>{out ? "Agotado" : `${p.stock} disp.`}</span>
                        )}
                        {qty > 0 && <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-peach text-white text-xs font-black grid place-items-center shadow-lift anim-pop">{qty}</span>}
                      </button>
                      <div className="p-3 flex flex-col flex-1">
                        <div className="font-extrabold text-[15px] leading-tight">{p.name}</div>
                        <div className="text-xs text-muted font-semibold mt-1 line-clamp-2 flex-1">{p.description}</div>
                        <div className="mt-2.5 flex items-center justify-between">
                          <div className="font-black text-[17px]">{money(p.price)}</div>
                          <div className="flex items-center gap-1">
                            <button disabled={qty === 0} onClick={() => cart.setQty(p.id, qty - 1)} className="w-8 h-8 rounded-lg bg-cream grid place-items-center disabled:opacity-40 hover:bg-line"><Minus size={14} /></button>
                            <span className="w-6 text-center font-black text-sm">{qty}</span>
                            <button disabled={out} onClick={() => cart.add(p)} className="w-8 h-8 rounded-lg bg-peach text-white grid place-items-center hover:bg-peach-2 disabled:opacity-40"><Plus size={14} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        )}
      </div>

      <OpenCashModal open={openCash} onClose={() => setOpenCash(false)} />

      {/* Order panel (desktop) */}
      <aside className="hidden lg:flex w-[380px] xl:w-[400px] shrink-0 bg-paper border-l border-line m-3 ml-0 rounded-3xl shadow-soft overflow-hidden">{OrderPanel}</aside>

      {/* Mobile cart FAB + sheet */}
      {!mobileCart && cart.lines.length > 0 && (
        <button onClick={() => setMobileCart(true)} className="lg:hidden fixed bottom-20 left-4 right-4 z-40 h-14 rounded-2xl bg-ink text-white font-black flex items-center justify-between px-5 shadow-pop anim-fade-up">
          <span className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-peach grid place-items-center text-xs">{totals.count}</span> Ver pedido</span><span>{money(totals.total)}</span>
        </button>
      )}
      {mobileCart && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileCart(false)} />
          <div className="relative bg-paper rounded-t-3xl h-[92vh] shadow-pop anim-fade-up overflow-hidden">{OrderPanel}</div>
        </div>
      )}

      {/* Note modal */}
      <Modal open={noteFor != null} onClose={() => setNoteFor(null)} title="Nota para cocina" width="max-w-sm"
        footer={<button className="btn-primary" onClick={() => setNoteFor(null)}>Listo</button>}>
        <input autoFocus className="input" placeholder="Ej: sin azúcar, extra caliente…" value={cart.lines.find((l) => l.product.id === noteFor)?.notes || ""} onChange={(e) => noteFor != null && cart.setNotes(noteFor, e.target.value)} />
      </Modal>

      {/* Discount modal */}
      <Modal open={showDiscount} onClose={() => setShowDiscount(false)} title="Descuento" subtitle="Monto fijo a descontar del subtotal" width="max-w-sm"
        footer={<><button className="btn-ghost" onClick={() => { cart.set({ discount: 0 }); setShowDiscount(false); }}>Quitar</button><button className="btn-primary" onClick={() => setShowDiscount(false)}>Aplicar</button></>}>
        <Field label="Descuento"><input className="input" type="number" min={0} step="0.5" value={cart.discount || ""} onChange={(e) => cart.set({ discount: Number(e.target.value) })} /></Field>
        <div className="flex gap-2 mt-3">{[5, 10, 15, 20].map((p) => <button key={p} className="chip bg-cream hover:bg-cream-2" onClick={() => cart.set({ discount: +((totals.subtotal * p) / 100).toFixed(2) })}>{p}%</button>)}</div>
        <Field label="Nota del pedido" className="mt-4"><input className="input" placeholder="Ej: cliente frecuente, cumpleaños…" value={cart.notes} onChange={(e) => cart.set({ notes: e.target.value })} /></Field>
      </Modal>

      {/* Done modal */}
      <Modal open={!!done} onClose={() => setDone(null)} width="max-w-md">
        {done && (
          <div className="text-center pt-2 anim-fade-up">
            <div className="mx-auto w-20 h-20 rounded-full bg-mint-soft text-mint-2 grid place-items-center anim-ring"><ChefHat size={36} /></div>
            <h3 className="text-2xl font-black mt-4">Pedido #{done.daily_number} enviado</h3>
            <p className="text-muted font-semibold mt-1">{done.paid ? `Cobrado ${money(done.total)} · ${done.payment_method === "cash" ? "Efectivo" : done.payment_method === "card" ? "Tarjeta" : "QR"}` : `Pendiente de pago · ${money(done.total)}`}</p>
            {done.payment_method === "cash" && done.cash_received != null && done.cash_received > done.total && (
              <div className="mt-3 inline-block px-4 py-2 rounded-xl bg-butter-soft text-[#9a6b00] font-black">Cambio: {money(done.cash_received - done.total)}</div>
            )}
            <div className="text-xs font-bold text-muted mt-3">Código de seguimiento: <span className="text-ink font-black tracking-wider">{done.code}</span></div>
            <div className="grid grid-cols-2 gap-2 mt-6">
              <button className="btn-soft" onClick={() => printOrder(done)}><Printer size={18} /> Ticket</button>
              <button className="btn-soft" onClick={() => printOrder(done, { kitchen: true })}><ChefHat size={18} /> Comanda</button>
            </div>
            <button className="btn-primary w-full mt-2" onClick={() => setDone(null)}>Nuevo pedido</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
