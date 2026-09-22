import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Plus, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Search, PackageOpen, History, Pencil, Trash2, Eye, Camera, X } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Modal, Field, Segmented, Empty, Loading, ProductThumb, Stat, Confirm } from "@/components/ui";
import { api } from "@/lib/api";
import { adjustStock, createIngredient } from "@/lib/actions";
import { useSocket } from "@/lib/socket";
import { money, num } from "@/lib/format";
import { StockLog } from "@/components/StockLog";
import { ImageCropper } from "@/components/ImageCropper";
import { ProductForm } from "@/components/ProductForm";
import type { Category, Ingredient, Product } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";

type Tab = "ingredients" | "products" | "movements";

const REASONS = ["compra", "ajuste", "merma", "devolución", "producción", "inventario"];

export default function Inventario() {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "inventario"; // move stock, create/edit ingredients
  const photoRequired = user?.role === "inventario";
  const [tab, setTab] = useState<Tab>("ingredients");
  const [ings, setIngs] = useState<Ingredient[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [newProduct, setNewProduct] = useState<(Partial<Product> & { image?: string | null }) | null>(null);
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [adjust, setAdjust] = useState<{ type: "product" | "ingredient"; id: number; name: string; unit: string; stock: number } | null>(null);
  const [adjQty, setAdjQty] = useState(""); const [adjMode, setAdjMode] = useState<"in" | "out" | "set">("in"); const [adjReason, setAdjReason] = useState("compra");
  const [adjNotes, setAdjNotes] = useState(""); const [adjPhoto, setAdjPhoto] = useState<string | null>(null); const [adjBusy, setAdjBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const ingredientPhotoRef = useRef<HTMLInputElement>(null);
  const [ingredientCrop, setIngredientCrop] = useState<string | null>(null);
  const [ingredientBusy, setIngredientBusy] = useState(false);
  const [edit, setEdit] = useState<Partial<Ingredient> | null>(null);
  const [del, setDel] = useState<Ingredient | null>(null);

  const load = () => Promise.all([
    api.get<Ingredient[]>("/api/inventory/ingredients").then(setIngs),
    api.get<Category[]>("/api/categories").then(setCats),
    api.get<Product[]>("/api/products?all=1").then((p) => setProducts(p.filter((x) => x.track_stock || x.recipe.length))),
  ]).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);
  useSocket({ "stock:updated": () => load(), "order:created": () => load(), "order:updated": () => load(), "sync:changed": () => load() });

  const s = q.trim().toLowerCase();
  const lowIngs = (ings || []).filter((i) => i.stock <= i.min_stock);
  const lowProds = (products || []).filter((p) => p.track_stock && p.stock <= p.min_stock);
  const filteredIngs = useMemo(() => (ings || []).filter((i) => (!s || i.name.toLowerCase().includes(s) || i.supplier.toLowerCase().includes(s)) && (!onlyLow || i.stock <= i.min_stock)), [ings, s, onlyLow]);
  const filteredProds = useMemo(() => (products || []).filter((p) => p.track_stock && (!s || p.name.toLowerCase().includes(s)) && (!onlyLow || p.stock <= p.min_stock)), [products, s, onlyLow]);
  const stockValue = (ings || []).reduce((t, i) => t + i.stock * i.cost, 0) + (products || []).filter((p) => p.track_stock).reduce((t, p) => t + p.stock * p.cost, 0);

  const openAdjust = (type: "product" | "ingredient", it: { id: number; name: string; unit?: string; stock: number }) => { setAdjust({ type, id: it.id, name: it.name, unit: it.unit || "u", stock: it.stock }); setAdjQty(""); setAdjMode("in"); setAdjReason("compra"); setAdjNotes(""); setAdjPhoto(null); };
  const pickPhoto = (f: File | undefined) => {
    if (!f) return;
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 1400; const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      setAdjPhoto(c.toDataURL("image/jpeg", 0.82)); URL.revokeObjectURL(url);
    };
    img.onerror = () => { toast.error("No se pudo leer la imagen"); URL.revokeObjectURL(url); };
    img.src = url;
  };
  const pickIngredientPhoto = (f: File | undefined) => { if (f && edit) setIngredientCrop(URL.createObjectURL(f)); };
  const closeIngredientCrop = () => {
    if (ingredientCrop?.startsWith("blob:")) URL.revokeObjectURL(ingredientCrop);
    setIngredientCrop(null);
  };
  const doAdjust = async () => {
    if (!adjust || adjQty === "") return;
    if (photoRequired && !adjPhoto) return toast.warning("Adjunta la foto del comprobante");
    const n = Number(adjQty);
    setAdjBusy(true);
    try {
      const item = adjust.type === "ingredient" ? ings?.find((i) => i.id === adjust.id) : undefined;
      const { queued } = await adjustStock({ item_type: adjust.type, item: { id: adjust.id, client_id: item?.client_id, name: adjust.name, unit: adjust.unit, stock: adjust.stock }, qty: adjMode === "out" ? -n : n, set: adjMode === "set", reason: adjReason, notes: adjNotes, photo: adjPhoto });
      toast.success("Stock actualizado", queued ? "Guardado en este dispositivo; se enviará al volver la conexión" : adjPhoto ? "Comprobante guardado" : undefined); setAdjust(null); load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setAdjBusy(false); }
  };
  const saveIng = async () => {
    if (!edit?.name) return toast.warning("Nombre requerido");
    setIngredientBusy(true);
    try {
      if (edit.id) { await api.put(`/api/inventory/ingredients/${edit.id > 0 ? edit.id : `c_${edit.client_id}`}`, edit); toast.success("Insumo guardado"); }
      else { const { queued } = await createIngredient(edit as Parameters<typeof createIngredient>[0]); toast.success("Insumo guardado", queued ? "Se enviará al volver la conexión" : undefined); }
      setEdit(null); load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setIngredientBusy(false); }
  };
  const LowBadge = ({ stock, min }: { stock: number; min: number }) => stock <= 0 ? <span className="pill bg-berry text-white">Agotado</span> : stock <= min ? <span className="pill bg-butter-soft text-[#9a6b00]"><AlertTriangle size={11} /> Bajo</span> : <span className="pill bg-mint-soft text-mint-2">OK</span>;
  const Bar = ({ stock, min }: { stock: number; min: number }) => { const pct = Math.max(0, Math.min(100, min > 0 ? (stock / (min * 2)) * 100 : stock > 0 ? 100 : 0)); const c = stock <= 0 ? "bg-berry" : stock <= min ? "bg-butter" : "bg-mint"; return <div className="h-1.5 w-24 rounded-full bg-cream-2 overflow-hidden"><div className={`h-full rounded-full ${c}`} style={{ width: `${pct}%` }} /></div>; };

  if (!ings || !products) return <Loading />;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader title="Inventario" subtitle="Insumos, stock de productos y movimientos">
        <Segmented value={tab} onChange={setTab} options={[{ value: "ingredients", label: "Insumos" }, { value: "products", label: "Productos" }, { value: "movements", label: <span className="flex items-center gap-1"><History size={14} /> Movimientos</span> }]} />
        {tab === "ingredients" && canManage && <button className="btn-primary" onClick={() => setEdit({ name: "", image: null, unit: "u", stock: 0, min_stock: 0, cost: 0, supplier: "" })}><Plus size={18} /> Insumo</button>}
        {tab === "products" && canManage && <button className="btn-primary" onClick={() => setNewProduct({ name: "", description: "", price: 0, cost: 0, emoji: "🍽️", category_id: cats[0]?.id ?? null, active: true, track_stock: false, stock: 0, min_stock: 5, recipe: [], options: [] })}><Plus size={18} /> Producto</button>}
        {!canManage && <span className="pill bg-cream-2 text-ink-3"><Eye size={12} /> Solo lectura</span>}
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Insumos" value={ings.length} sub={`${lowIngs.length} con stock bajo`} tone="sky" icon={<Boxes size={22} />} />
          <Stat label="Productos con stock" value={products.filter((p) => p.track_stock).length} sub={`${lowProds.length} con stock bajo`} tone="lilac" icon={<PackageOpen size={22} />} />
          <Stat label="Alertas" value={lowIngs.length + lowProds.length} sub="por reponer" tone={lowIngs.length + lowProds.length ? "berry" : "mint"} icon={<AlertTriangle size={22} />} />
          <Stat label="Valor en stock" value={money(stockValue)} sub="a precio de costo" tone="peach" icon={<ArrowDownToLine size={22} />} />
        </div>

        {tab !== "movements" && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input h-10 pl-9" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button className={`chip ${onlyLow ? "bg-berry text-white" : "bg-paper border border-line text-ink-3"}`} onClick={() => setOnlyLow(!onlyLow)}><AlertTriangle size={13} /> Solo stock bajo</button>
          </div>
        )}

        {tab === "ingredients" && (filteredIngs.length === 0 ? <Empty title="Sin insumos" hint="Agrega insumos para controlar tu stock y recetas." /> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-cream text-[11px] uppercase tracking-wider text-muted font-extrabold"><tr><th className="text-left px-4 py-3">Insumo</th><th className="text-left px-4 py-3">Proveedor</th><th className="text-left px-4 py-3">Stock</th><th className="text-left px-4 py-3">Mínimo</th><th className="text-left px-4 py-3">Estado</th><th className="text-right px-4 py-3">Costo/u</th><th className="text-right px-4 py-3">Valor</th><th className="px-2 py-3" /></tr></thead>
              <tbody>
                {filteredIngs.map((i) => (
                  <tr key={i.id} className={`border-t border-line hover:bg-cream/60 ${i.stock <= i.min_stock ? "bg-berry-soft/30" : ""}`}>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-3">{i.image ? <img src={i.image} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-xl object-cover shrink-0" /> : <div className="w-10 h-10 rounded-xl bg-sky-soft text-sky grid place-items-center shrink-0"><Boxes size={19} /></div>}<div className="font-extrabold">{i.name}<div className="text-[11px] text-muted font-bold">usado en {i.used_in} producto{i.used_in === 1 ? "" : "s"}</div></div></div></td>
                    <td className="px-4 py-2.5 font-semibold text-muted">{i.supplier || "—"}</td>
                    <td className="px-4 py-2.5"><div className="font-black">{num(i.stock, 2)} {i.unit}</div><Bar stock={i.stock} min={i.min_stock} /></td>
                    <td className="px-4 py-2.5 font-bold text-muted">{num(i.min_stock, 2)} {i.unit}</td>
                    <td className="px-4 py-2.5"><LowBadge stock={i.stock} min={i.min_stock} /></td>
                    <td className="px-4 py-2.5 text-right font-bold">{money(i.cost)}</td>
                    <td className="px-4 py-2.5 text-right font-black">{money(i.stock * i.cost)}</td>
                    <td className="px-2 py-2.5">{canManage && <div className="flex justify-end gap-1">
                      <button className="btn btn-sm btn-soft" onClick={() => openAdjust("ingredient", i)}><ArrowDownToLine size={14} /> Ajustar</button>
                      <button className="btn-icon btn-ghost w-9 h-9" onClick={() => setEdit(i)}><Pencil size={15} /></button>
                      {isAdmin && <button className="btn-icon btn-ghost w-9 h-9 text-berry" onClick={() => setDel(i)}><Trash2 size={15} /></button>}
                    </div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === "products" && (filteredProds.length === 0 ? <Empty title="Sin productos con control de stock" hint={isAdmin ? "Activa «Controlar stock» en un producto desde Administración." : "El administrador puede activar el control de stock por producto."} /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredProds.map((p) => (
              <div key={p.id} className={`card p-3.5 flex items-center gap-3 ${p.stock <= p.min_stock ? "border-berry/40" : ""}`}>
                <ProductThumb emoji={p.emoji} image={p.image} color={p.category_color} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold truncate">{p.name}</div>
                  <div className="text-xs font-bold text-muted">{p.category_name} · mín. {p.min_stock}</div>
                  <div className="mt-1.5 flex items-center gap-2"><Bar stock={p.stock} min={p.min_stock} /><LowBadge stock={p.stock} min={p.min_stock} /></div>
                </div>
                <div className="text-right"><div className="text-2xl font-black">{num(p.stock)}</div>{canManage && <button className="btn btn-sm btn-soft mt-1" onClick={() => openAdjust("product", p)}>Ajustar</button>}</div>
              </div>
            ))}
          </div>
        ))}

        {tab === "movements" && <StockLog manualOnly={user?.role === "inventario"} />}
      </div>

      {/* Adjust modal */}
      <Modal open={!!adjust} onClose={() => setAdjust(null)} title={adjust ? `Ajustar: ${adjust.name}` : ""} subtitle={adjust ? `Stock actual: ${num(adjust.stock, 2)} ${adjust.unit}` : ""} width="max-w-sm"
        footer={<><button className="btn-ghost" onClick={() => setAdjust(null)}>Cancelar</button><button className="btn-primary" disabled={adjBusy || adjQty === "" || (photoRequired && !adjPhoto)} onClick={doAdjust}>Guardar</button></>}>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {([["in", "Entrada", <ArrowDownToLine size={18} />], ["out", "Salida", <ArrowUpFromLine size={18} />], ["set", "Fijar", <Pencil size={18} />]] as ["in" | "out" | "set", string, React.ReactNode][]).map(([m, l, ic]) => (
            <button key={m} onClick={() => { setAdjMode(m); setAdjReason(m === "in" ? "compra" : m === "out" ? "merma" : "inventario"); }} className={`h-14 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 text-xs font-extrabold ${adjMode === m ? "border-peach bg-peach-soft text-peach-2" : "border-line text-muted"}`}>{ic}{l}</button>
          ))}
        </div>
        <Field label={adjMode === "set" ? "Nuevo stock" : "Cantidad"}><input autoFocus className="input text-lg" type="number" inputMode="decimal" min={0} step="any" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} /></Field>
        {adjust && adjQty !== "" && <div className="mt-2 text-sm font-black text-ink-3">Stock resultante: {num(adjMode === "set" ? Number(adjQty) : adjust.stock + (adjMode === "out" ? -1 : 1) * Number(adjQty), 2)} {adjust.unit}</div>}
        <div className="mt-4">
          <label className="label">Foto del comprobante {photoRequired ? <span className="text-berry">(obligatoria)</span> : <span className="normal-case tracking-normal">(opcional)</span>}</label>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          {adjPhoto ? (
            <div className="relative rounded-2xl overflow-hidden border border-line">
              <img src={adjPhoto} alt="Comprobante" className="w-full max-h-56 object-cover" />
              <button className="absolute top-2 right-2 w-8 h-8 rounded-full bg-ink/70 text-white grid place-items-center" onClick={() => setAdjPhoto(null)} aria-label="Quitar foto"><X size={14} /></button>
              <button className="absolute bottom-2 right-2 btn btn-sm bg-paper/90 text-ink" onClick={() => photoRef.current?.click()}><Camera size={14} /> Cambiar</button>
            </div>
          ) : (
            <button onClick={() => photoRef.current?.click()} className={`w-full h-28 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 font-bold text-sm transition ${photoRequired ? "border-peach/60 bg-peach-soft/40 text-peach-2 hover:bg-peach-soft" : "border-line text-muted hover:bg-cream"}`}>
              <Camera size={24} /> Tomar foto o subir imagen
            </button>
          )}
        </div>
        <Field label="Motivo" className="mt-3"><select className="input" value={adjReason} onChange={(e) => setAdjReason(e.target.value)}>{REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
        <Field label="Detalle (opcional)" className="mt-3"><input className="input" placeholder="Ej: factura #1234, proveedor, lote…" value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} maxLength={500} /></Field>
        <p className="text-[11px] font-semibold text-muted mt-3">Se registrará con fecha y hora actual a nombre de {user?.name}.</p>
      </Modal>

      {/* Ingredient modal */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Editar insumo" : "Nuevo insumo"} width="max-w-md"
        footer={<><button className="btn-ghost" disabled={ingredientBusy} onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary" disabled={ingredientBusy} onClick={saveIng}>{ingredientBusy ? "Guardando…" : "Guardar"}</button></>}>
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Foto del insumo</label>
              <input ref={ingredientPhotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pickIngredientPhoto(e.target.files?.[0]); e.target.value = ""; }} />
              {edit.image ? (
                <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
                  <img src={edit.image} alt={`Foto de ${edit.name || "insumo"}`} className="w-20 h-20 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0"><div className="font-extrabold truncate">Foto seleccionada</div><div className="text-xs text-muted font-semibold mt-0.5">Se guardará y se enviará al Telegram.</div></div>
                  <div className="flex flex-col gap-1"><button type="button" className="btn btn-sm btn-soft" onClick={() => setIngredientCrop(edit.image!)}>Ajustar</button><button type="button" className="btn btn-sm btn-ghost text-berry" onClick={() => setEdit({ ...edit, image: null })}><X size={14} /> Quitar</button></div>
                </div>
              ) : (
                <button type="button" onClick={() => ingredientPhotoRef.current?.click()} className="w-full h-24 rounded-2xl border-2 border-dashed border-line text-muted hover:bg-cream flex flex-col items-center justify-center gap-1 font-bold text-sm"><Camera size={22} /> Tomar foto o subir imagen</button>
              )}
              {edit.image && <button type="button" className="btn-soft btn-sm mt-2" onClick={() => ingredientPhotoRef.current?.click()}><Camera size={15} /> Cambiar foto</button>}
            </div>
            <Field label="Nombre" className="col-span-2"><input autoFocus className="input" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Unidad"><select className="input" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>{["u", "kg", "g", "L", "ml", "caja", "paq"].map((u) => <option key={u}>{u}</option>)}</select></Field>
            <Field label="Costo por unidad"><input className="input" type="number" step="any" value={edit.cost ?? 0} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} /></Field>
            {!edit.id && <Field label="Stock inicial"><input className="input" type="number" step="any" value={edit.stock ?? 0} onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })} /></Field>}
            <Field label="Stock mínimo" hint="Alerta cuando baje de este valor"><input className="input" type="number" step="any" value={edit.min_stock ?? 0} onChange={(e) => setEdit({ ...edit, min_stock: Number(e.target.value) })} /></Field>
            <Field label="Proveedor" className="col-span-2"><input className="input" value={edit.supplier || ""} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <ImageCropper open={!!ingredientCrop} src={ingredientCrop} title="Ajustar foto del insumo" onClose={closeIngredientCrop} onDone={(dataUrl) => { setEdit((current) => current && { ...current, image: dataUrl }); closeIngredientCrop(); }} />

      <ProductForm product={newProduct} cats={cats} ings={ings || []} onClose={() => setNewProduct(null)} onSaved={load} />

      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Eliminar" title={del ? `¿Eliminar ${del.name}?` : ""} message="Se quitará de todas las recetas que lo usan." onConfirm={async () => { if (!del) return; try { await api.delete(`/api/inventory/ingredients/${del.id}`); toast.success("Insumo eliminado"); load(); } catch (e) { toast.error((e as Error).message); } }} />
    </div>
  );
}
