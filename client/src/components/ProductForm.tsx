import { useEffect, useRef, useState } from "react";
import { Save, ImagePlus, Crop, X, Plus } from "lucide-react";
import { Modal, Field, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { toast } from "@/store/toast";
import { ImageCropper } from "@/components/ImageCropper";
import { OptionsEditor } from "@/components/OptionsEditor";
import type { Category, Ingredient, Product, RecipeLine } from "@/lib/types";

const EMOJIS = ["☕", "🍵", "🧋", "🥤", "🧃", "🍹", "🍦", "🍨", "🍧", "🍰", "🧁", "🍩", "🍪", "🍫", "🍓", "🍌", "🥐", "🥖", "🥯", "🍞", "🥧", "🥪", "🥑", "🧀", "🍕", "🌮", "🥗", "🍳", "💧", "🫖", "🍽️", "🐼"];

/* Unidades alternativas por insumo: la cantidad de la receta se guarda en la unidad base y
   el formulario permite escribir en la unidad más práctica (g para kg, ml para L, etc.). */
const RECIPE_UNITS: Record<string, string[]> = { kg: ["g", "kg"], L: ["ml", "L"], g: ["g"], ml: ["ml"], u: ["u"], caja: ["caja"], paq: ["paq"] };
/** Convierte el valor escrito a la unidad base del insumo (1 g = 0.001 kg, 1 ml = 0.001 L). */
const toBaseQty = (base: string, disp: string, v: number) => (disp === "g" && base === "kg") || (disp === "ml" && base === "L") ? v / 1000 : v;
/** Convierte la cantidad base guardada a la unidad mostrada (0.25 kg → 250 g). */
const fromBaseQty = (base: string, disp: string, v: number) => (disp === "g" && base === "kg") || (disp === "ml" && base === "L") ? v * 1000 : v;

/** Product draft while editing: `recipe` entries may carry `_unit` (the unit the user wrote the qty in). */
type Draft = Omit<Partial<Product>, "recipe"> & { image?: string | null; recipe?: RecipeDraft[] };
/** Recipe line while editing: `_unit` is the unit the user wrote the qty in; stripped before saving. */
type RecipeDraft = RecipeLine & { _unit?: string };

/** Modal to create/edit a product (photo cropper, emoji, price/cost, stock, recipe, sabores/adicionales). */
export function ProductForm({ product, cats, ings, onClose, onSaved }: {
  product: Draft | null;
  cats: Category[];
  ings: Ingredient[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [edit, setEdit] = useState<Draft | null>(product);
  const fileRef = useRef<HTMLInputElement>(null);
  const [crop, setCrop] = useState<string | null>(null);
  const [lineUnit, setLineUnit] = useState<Record<number, string>>({});
  useEffect(() => { setEdit(product); setCrop(null); setLineUnit({}); }, [product]);

  if (!product || !edit) return null;
  const closeCrop = () => { if (crop?.startsWith("blob:")) URL.revokeObjectURL(crop); setCrop(null); };
  const pick = (f: File | undefined) => { if (f) setCrop(URL.createObjectURL(f)); };
  const save = async () => {
    if (!edit?.name || edit.price == null) return toast.warning("Nombre y precio son requeridos");
    const options = (edit.options || []).map((g) => ({ ...g, name: g.name.trim(), choices: g.choices.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), price: Number(c.price) || 0 })) })).filter((g) => g.name || g.choices.length);
    const broken = options.find((g) => !g.name || !g.choices.length);
    if (broken) return toast.warning(broken.name ? `Agrega al menos una opción en "${broken.name}"` : "Ponle nombre al grupo de opciones");
    try {
      const recipe = (edit.recipe || []).map(({ _unit: _u, ...r }) => r);
      const body = { ...edit, options, recipe };
      if (edit.id) await api.put(`/api/products/${edit.id}`, body); else await api.post("/api/products", body);
      toast.success("Producto guardado"); onSaved(); onClose();
    } catch (e) { toast.error((e as Error).message); }
  };

  const catColor = cats.find((c) => c.id === edit.category_id)?.color || "#F2915A";
  return (
    <>
      <Modal open={!!edit} onClose={onClose} title={edit.id ? "Editar producto" : "Nuevo producto"} width="max-w-2xl"
        footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save}><Save size={18} /> Guardar</button></>}>
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5">
          <div>
            <label className="label">Imagen</label>
            <div className="relative">
              {edit.image ? <img src={edit.image} alt="" className="w-full aspect-square object-cover rounded-2xl" /> : (
                <div className="w-full aspect-square rounded-2xl grid place-items-center text-7xl" style={{ background: `linear-gradient(145deg, ${catColor}2e, ${catColor}66)` }}>{edit.emoji}</div>
              )}
              {edit.image && <button className="absolute top-2 right-2 w-8 h-8 rounded-full bg-ink/70 text-white grid place-items-center" onClick={() => setEdit({ ...edit, image: null })}><X size={14} /></button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="flex gap-2 mt-2">
              <button className="btn-soft btn-sm flex-1" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> Subir foto</button>
              {edit.image && <button className="btn-soft btn-sm flex-1" onClick={() => setCrop(edit.image!)}><Crop size={15} /> Ajustar</button>}
            </div>
            <label className="label mt-3">Emoji</label>
            <div className="flex flex-wrap gap-1">{EMOJIS.map((e) => <button key={e} onClick={() => setEdit({ ...edit, emoji: e })} className={`w-8 h-8 rounded-lg text-lg grid place-items-center ${edit.emoji === e ? "bg-peach-soft ring-2 ring-peach" : "hover:bg-cream"}`}>{e}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 content-start">
            <Field label="Nombre" className="col-span-2"><input autoFocus className="input" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Descripción" className="col-span-2"><input className="input" value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Categoría" className="col-span-2"><select className="input" value={edit.category_id ?? ""} onChange={(e) => setEdit({ ...edit, category_id: e.target.value ? Number(e.target.value) : null })}><option value="">Sin categoría</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</select></Field>
            <Field label="Precio de venta"><input className="input" type="number" step="0.01" min={0} value={edit.price ?? 0} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></Field>
            <Field label="Costo" hint="Para calcular ganancias"><input className="input" type="number" step="0.01" min={0} value={edit.cost ?? 0} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} /></Field>
            <div className="col-span-2 flex flex-wrap gap-5 py-1">
              <Toggle checked={!!edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Visible en el menú" />
              <Toggle checked={!!edit.track_stock} onChange={(v) => setEdit({ ...edit, track_stock: v })} label="Controlar stock por unidad" />
            </div>
            {edit.track_stock && (<>
              <Field label="Stock actual"><input className="input" type="number" step="any" value={edit.stock ?? 0} onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })} /></Field>
              <Field label="Stock mínimo"><input className="input" type="number" step="any" value={edit.min_stock ?? 0} onChange={(e) => setEdit({ ...edit, min_stock: Number(e.target.value) })} /></Field>
            </>)}
            <div className="col-span-2">
              <label className="label">Receta (insumos que descuenta cada venta)</label>
              <p className="text-[11px] font-semibold text-muted mb-2">Elige la unidad (ej. 250 <b>g</b> de café) — la app convierte y guarda en la unidad del insumo.</p>
              <div className="space-y-2">
                {(edit.recipe || []).map((r, i) => {
                  const base = ings.find((g) => g.id === r.ingredient_id)?.unit || "u";
                  const units = RECIPE_UNITS[base] || [base];
                  const du = (r as RecipeDraft)._unit || units[0];
                  return (
                    <div key={i} className="flex gap-2 items-center flex-wrap">
                      <select className="input h-10 min-w-[160px] flex-[2_1_160px]" value={r.ingredient_id} onChange={(e) => { const recipe = [...(edit.recipe || [])]; const n = Number(e.target.value); recipe[i] = { ...recipe[i], ingredient_id: n, _unit: undefined }; setEdit({ ...edit, recipe }); }}>
                        {ings.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}
                      </select>
                      <input className="input h-10 w-24 text-right" type="number" step="any" min={0} value={fromBaseQty(base, du, Number(r.qty) || 0)} onChange={(e) => { const recipe = [...(edit.recipe || [])]; recipe[i] = { ...recipe[i], qty: toBaseQty(base, du, Number(e.target.value) || 0) }; setEdit({ ...edit, recipe }); }} />
                      <select className="input h-10 w-[74px]" value={du} onChange={(e) => { const recipe = [...(edit.recipe || [])]; recipe[i] = { ...recipe[i], _unit: e.target.value }; setEdit({ ...edit, recipe }); }}>
                        {units.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <button className="btn-icon btn-ghost w-9 h-9 text-berry" onClick={() => setEdit({ ...edit, recipe: (edit.recipe || []).filter((_, j) => j !== i) })}><X size={15} /></button>
                    </div>
                  );
                })}
                <button className="btn-soft btn-sm" disabled={!ings.length} onClick={() => setEdit({ ...edit, recipe: [...(edit.recipe || []), { ingredient_id: ings[0]?.id, qty: 1, _unit: undefined }] })}><Plus size={14} /> Agregar insumo</button>
              </div>
            </div>
            <div className="col-span-2">
              <label className="label">Sabores y adicionales (el cajero los elige al vender)</label>
              <OptionsEditor value={edit.options || []} onChange={(options) => setEdit({ ...edit, options })} />
            </div>
          </div>
        </div>
      </Modal>
      <ImageCropper open={!!crop} src={crop} onClose={closeCrop} onDone={(dataUrl) => { setEdit((e) => e && { ...e, image: dataUrl }); closeCrop(); }} />
    </>
  );
}