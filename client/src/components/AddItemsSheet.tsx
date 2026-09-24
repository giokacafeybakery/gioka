import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, Plus, Minus, StickyNote, Trash2, Loader2, UtensilsCrossed, CloudOff } from "lucide-react";
import { Empty, Loading, Modal, ProductThumb } from "@/components/ui";
import { OptionsPicker } from "@/components/OptionsPicker";
import { api } from "@/lib/api";
import { addOrderItems } from "@/lib/actions";
import { money } from "@/lib/format";
import { optionsSummary } from "@/lib/options";
import { lineKey, lineUnitPrice, type CartLine } from "@/store/cart";
import type { Category, Order, Product, SelectedOption } from "@/lib/types";
import type { TableAccount } from "@/lib/tables";
import { useSettings } from "@/store/settings";
import { printOrder } from "@/components/Receipt";
import { toast } from "@/store/toast";

/**
 * Añadir productos a una cuenta abierta: el mismo menú del PDV, pero lo elegido se suma como una ronda más
 * del pedido de la mesa. Usa su propia lista (no el carrito del PDV) para no pisar un pedido a medio tomar.
 */
export function AddItemsSheet({ account, onClose, onDone }: { account: TableAccount | null; onClose: () => void; onDone: (order: Order) => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [cat, setCat] = useState<number | "all">("all");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<Product | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // La cuenta puede tener varios pedidos; la ronda nueva se suma al último, que es el que sigue en la mesa.
  const target = account?.orders.at(-1) || null;
  const round = target ? target.items.reduce((m, i) => Math.max(m, i.round || 1), 1) + 1 : 1;

  useEffect(() => {
    if (!account) return;
    setLines([]); setQ(""); setCat("all"); setBusy(false);
    api.get<Category[]>("/api/categories").then(setCats).catch(() => {});
    api.get<Product[]>("/api/products").then(setProducts).catch(() => setProducts([]));
  }, [account?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (products || []).filter((p) => (cat === "all" || p.category_id === cat) && (!s || p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s)));
  }, [products, cat, q]);

  const add = (p: Product, options: SelectedOption[] = []) => setLines((cur) => {
    const key = lineKey(p.id, options);
    const i = cur.findIndex((l) => l.key === key);
    if (i >= 0) return cur.map((l, n) => (n === i ? { ...l, qty: l.qty + 1 } : l));
    return [...cur, { key, product: p, qty: 1, notes: "", options }];
  });
  const setQty = (key: string, qty: number) => setLines((cur) => (qty <= 0 ? cur.filter((l) => l.key !== key) : cur.map((l) => (l.key === key ? { ...l, qty } : l))));
  const setNotes = (key: string, notes: string) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, notes } : l)));
  const addProduct = (p: Product) => (p.options?.length ? setPicking(p) : add(p));
  const qtyOf = (id: number) => lines.filter((l) => l.product.id === id).reduce((s, l) => s + l.qty, 0);
  const removeOne = (id: number) => { const l = [...lines].reverse().find((x) => x.product.id === id); if (l) setQty(l.key, l.qty - 1); };

  const units = lines.reduce((s, l) => s + l.qty, 0);
  const extra = +lines.reduce((s, l) => s + lineUnitPrice(l) * l.qty, 0).toFixed(2);

  const submit = async () => {
    if (!target || !lines.length || busy) return;
    setBusy(true);
    try {
      const { result, queued } = await addOrderItems(target, lines, products || []);
      // La cocina necesita la comanda de lo que acaba de entrar (en modo red la imprime el servidor).
      const settings = useSettings.getState().settings;
      if (settings?.auto_print && settings.printer_mode === "browser")
        printOrder({ ...result, items: result.items.filter((i) => (i.round || 1) === round) }, { kitchen: true, silent: true });
      toast.success(`Mesa ${account?.table} actualizada`, `${units} ${units === 1 ? "producto añadido" : "productos añadidos"} · ${money(extra)}`);
      if (queued) toast.info("Guardado en este dispositivo", "Se enviará a cocina al volver la conexión.");
      onDone(result);
      onClose();
    } catch (e) {
      toast.error("No se pudo agregar", (e as Error).message);
      setBusy(false);
    }
  };

  if (!account) return null;

  const BasketList = (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
      {lines.length === 0 ? (
        <div className="h-full grid place-items-center text-center px-4">
          <div>
            <div className="mx-auto w-12 h-12 rounded-2xl bg-cream grid place-items-center text-muted"><UtensilsCrossed size={22} /></div>
            <p className="mt-3 text-sm font-bold text-muted leading-relaxed">Toca los productos del menú<br />para sumarlos a la cuenta.</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => {
            const unit = lineUnitPrice(l); const opts = optionsSummary(l.options);
            return (
              <li key={l.key} className="flex items-center gap-3 p-2 rounded-2xl bg-cream/70 anim-fade-up">
                <ProductThumb emoji={l.product.emoji} image={l.product.image} color={l.product.category_color} size={44} rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-[14px] leading-tight truncate">{l.product.name}</div>
                  {opts && <div className="text-xs font-bold text-ink-3 leading-snug">{opts}</div>}
                  <div className="text-xs font-bold text-muted">{money(unit)} × {l.qty}{l.notes && <span className="text-peach-2"> · {l.notes}</span>}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="font-black text-[14px]">{money(unit * l.qty)}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setNoteFor(l.key)} className="w-7 h-7 rounded-lg grid place-items-center text-muted hover:bg-paper hover:text-peach-2" title="Nota para cocina"><StickyNote size={14} /></button>
                    <button onClick={() => setQty(l.key, l.qty - 1)} className="w-7 h-7 rounded-lg bg-paper grid place-items-center hover:bg-line"><Minus size={14} /></button>
                    <span className="w-5 text-center font-black text-sm">{l.qty}</span>
                    <button onClick={() => setQty(l.key, l.qty + 1)} className="w-7 h-7 rounded-lg bg-ink text-white grid place-items-center hover:bg-ink-2"><Plus size={14} /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const BasketFooter = (
    <div className="border-t border-line px-4 py-3.5">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] font-extrabold text-muted">{units} {units === 1 ? "producto nuevo" : "productos nuevos"}</span>
        <span className="text-xl font-black">{money(extra)}</span>
      </div>
      <div className="flex items-baseline justify-between text-[13px] font-bold text-muted mb-3">
        <span>Cuenta de la mesa</span>
        <span className="text-ink">{money(account.total)} → <span className="text-peach-2">{money(+(account.total + extra).toFixed(2))}</span></span>
      </div>
      <button className="btn-primary btn-lg w-full" disabled={!lines.length || busy} onClick={() => void submit()}>
        {busy ? <><Loader2 size={20} className="animate-spin" /> Enviando…</> : <><Plus size={20} /> Agregar a la cuenta</>}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-cream flex flex-col anim-fade-up">
      <header className="flex items-center gap-3 px-4 md:px-5 h-[68px] shrink-0 bg-paper border-b border-line">
        <button onClick={onClose} className="btn-icon btn-ghost -ml-2" aria-label="Volver"><ArrowLeft size={22} /></button>
        <div className="min-w-0">
          <h2 className="text-lg md:text-xl font-black tracking-tight leading-tight truncate">Mesa {account.table} · agregar productos</h2>
          <p className="text-xs font-bold text-muted truncate">
            {target ? <>Se suma al pedido #{target.daily_number} como ronda {round}</> : "Sin pedido abierto"}
            {account.names && ` · ${account.names}`}
          </p>
        </div>
        <div className="flex-1" />
        <div className="relative hidden sm:block w-64">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-10 rounded-full" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <section className="flex-1 min-w-0 flex flex-col">
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 md:px-5 py-3 shrink-0">
            <div className="relative sm:hidden w-44 shrink-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input h-8 pl-9 rounded-full text-[13px]" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button onClick={() => setCat("all")} className={`chip shrink-0 ${cat === "all" ? "bg-ink text-white" : "bg-paper border border-line text-ink-3 hover:bg-cream-2"}`}>🍽️ Todo</button>
            {cats.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={`chip shrink-0 ${cat === c.id ? "text-white" : "bg-paper border border-line text-ink-3 hover:bg-cream-2"}`} style={cat === c.id ? { background: c.color } : undefined}>{c.emoji} {c.name}</button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 pb-5">
            {!products ? <Loading /> : filtered.length === 0 ? <Empty title="Sin resultados" hint="Prueba con otra búsqueda o categoría." /> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map((p) => {
                  const qty = qtyOf(p.id); const out = p.track_stock && p.stock <= 0; const low = p.track_stock && !out && p.stock <= p.min_stock;
                  return (
                    <div key={p.id} className={`card overflow-hidden flex flex-col transition hover:shadow-lift ${out ? "opacity-60" : ""}`}>
                      <button disabled={out} onClick={() => addProduct(p)} className="relative text-left cursor-pointer disabled:cursor-not-allowed">
                        {p.image ? <img src={p.image} alt="" className="w-full aspect-[4/3] object-cover" /> : (
                          <div className="w-full aspect-[4/3] grid place-items-center" style={{ background: `linear-gradient(145deg, ${p.category_color || "#F2915A"}2e, ${p.category_color || "#F2915A"}66)` }}>
                            <span className="text-5xl drop-shadow-md select-none">{p.emoji}</span>
                          </div>
                        )}
                        {p.track_stock && <span className={`absolute top-2 left-2 pill ${out ? "bg-berry text-white" : low ? "bg-butter text-ink" : "bg-paper/90 text-ink-3"}`}>{out ? "Agotado" : `${p.stock} disp.`}</span>}
                        {qty > 0 && <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-peach text-white text-xs font-black grid place-items-center shadow-lift anim-pop">{qty}</span>}
                      </button>
                      <div className="p-3 flex flex-col flex-1">
                        <div className="font-extrabold text-[15px] leading-tight">{p.name}</div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="font-black text-[17px]">{money(p.price)}</div>
                          <div className="flex items-center gap-1">
                            <button disabled={qty === 0} onClick={() => removeOne(p.id)} className="w-8 h-8 rounded-lg bg-cream grid place-items-center disabled:opacity-40 hover:bg-line"><Minus size={14} /></button>
                            <span className="w-6 text-center font-black text-sm">{qty}</span>
                            <button disabled={out} onClick={() => addProduct(p)} className="w-8 h-8 rounded-lg bg-peach text-white grid place-items-center hover:bg-peach-2 disabled:opacity-40"><Plus size={14} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Lo que se va a agregar (escritorio) */}
        <aside className="hidden lg:flex w-[360px] shrink-0 flex-col bg-paper border-l border-line">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <div>
              <h3 className="font-black text-[17px] leading-tight">Ronda {round}</h3>
              <p className="text-xs font-bold text-muted">Se enviará a cocina al agregar</p>
            </div>
            {lines.length > 0 && <button className="btn-icon btn-ghost text-berry" onClick={() => setLines([])} title="Vaciar"><Trash2 size={18} /></button>}
          </div>
          {BasketList}
          {BasketFooter}
        </aside>
      </div>

      {/* Lo que se va a agregar (móvil): la lista solo aparece cuando hay algo elegido */}
      <div className="lg:hidden shrink-0 bg-paper border-t border-line flex flex-col pb-[env(safe-area-inset-bottom)]">
        {lines.length > 0 && (
          <>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <h3 className="font-black text-[15px]">Ronda {round}</h3>
              <button className="text-xs font-extrabold text-berry" onClick={() => setLines([])}>Vaciar</button>
            </div>
            <div className="flex flex-col max-h-[34vh] min-h-0">{BasketList}</div>
          </>
        )}
        {BasketFooter}
      </div>

      {account.pending && (
        <div className="absolute top-[76px] right-4 pill bg-butter-soft text-[#9a6b00] shadow-soft"><CloudOff size={12} /> Cuenta sin sincronizar</div>
      )}

      <OptionsPicker product={picking} onClose={() => setPicking(null)} onAdd={(options) => { if (picking) add(picking, options); setPicking(null); }} />
      <Modal open={noteFor != null} onClose={() => setNoteFor(null)} title="Nota para cocina" width="max-w-sm"
        footer={<button className="btn-primary" onClick={() => setNoteFor(null)}>Listo</button>}>
        <input autoFocus className="input" placeholder="Ej: sin azúcar, extra caliente…" value={lines.find((l) => l.key === noteFor)?.notes || ""} onChange={(e) => noteFor != null && setNotes(noteFor, e.target.value)} />
      </Modal>
    </div>
  );
}
