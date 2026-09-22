import { useEffect, useRef, useState } from "react";
import { Plus, X, IceCreamCone, Sparkles, GripVertical, Boxes } from "lucide-react";
import { Segmented, Toggle } from "@/components/ui";
import type { Ingredient, OptionChoice, OptionGroup } from "@/lib/types";

/* Unidades alternativas por insumo: el consumo de una opción se guarda en la unidad base del
   insumo y el editor permite escribir en la unidad más práctica (g para kg, ml para L, etc.). */
const UNITS: Record<string, string[]> = { kg: ["g", "kg"], L: ["ml", "L"], g: ["g"], ml: ["ml"], u: ["u"], caja: ["caja"], paq: ["paq"] };
const toBaseQty = (base: string, disp: string, v: number) => (disp === "g" && base === "kg") || (disp === "ml" && base === "L") ? v / 1000 : v;
const fromBaseQty = (base: string, disp: string, v: number) => (disp === "g" && base === "kg") || (disp === "ml" && base === "L") ? v * 1000 : v;

/**
 * Admin editor for a product's sabores y adicionales. Each group has a name, a mode (one choice / several),
 * whether the cashier must choose, and its choices with an optional extra price.
 * A choice may optionally consume an ingredient (stock) when sold, with its own quantity and unit.
 */
export function OptionsEditor({ value, onChange, ings }: { value: OptionGroup[]; onChange: (groups: OptionGroup[]) => void; ings: Ingredient[] }) {
  const groups = value || [];
  const setGroup = (i: number, patch: Partial<OptionGroup>) => onChange(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const addGroup = (g: OptionGroup) => onChange([...groups, g]);
  const presets = {
    sabor: (): OptionGroup => ({ name: "Sabor", type: "single", required: true, choices: [{ name: "", price: 0 }] }),
    extra: (): OptionGroup => ({ name: "Adicionales", type: "multi", required: false, choices: [{ name: "", price: 0 }] }),
  };

  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <div key={i} className="rounded-2xl border border-line bg-cream/50 p-3 anim-fade-up">
          <div className="flex flex-wrap items-center gap-2">
            <GripVertical size={16} className="text-muted/60 shrink-0 hidden sm:block" />
            <input className="input h-10 flex-1 min-w-[140px] font-extrabold" placeholder="Nombre del grupo (Sabor, Tamaño, Adicionales…)" value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} />
            <Segmented value={g.type} onChange={(type) => setGroup(i, { type })} options={[{ value: "single", label: "Elegir uno" }, { value: "multi", label: "Varios" }]} />
            <Toggle checked={g.required} onChange={(required) => setGroup(i, { required })} label="Obligatorio" />
            <button type="button" className="btn-icon btn-ghost w-9 h-9 text-berry ml-auto" title="Quitar grupo" onClick={() => onChange(groups.filter((_, j) => j !== i))}><X size={16} /></button>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_110px_36px] gap-2 items-center">
            <span className="label !mb-0">Opción</span><span className="label !mb-0">Extra ($)</span><span />
            {g.choices.map((c, k) => (
              <ChoiceRow key={k} choice={c} ings={ings} autoFocus={c.name === "" && k === g.choices.length - 1}
                onChange={(patch) => setGroup(i, { choices: g.choices.map((x, m) => (m === k ? { ...x, ...patch } : x)) })}
                onRemove={() => setGroup(i, { choices: g.choices.filter((_, m) => m !== k) })}
                onEnter={() => setGroup(i, { choices: [...g.choices, { name: "", price: 0 }] })} />
            ))}
          </div>
          <button type="button" className="btn-soft btn-sm mt-2" onClick={() => setGroup(i, { choices: [...g.choices, { name: "", price: 0 }] })}><Plus size={14} /> Agregar opción</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-soft btn-sm" onClick={() => addGroup(presets.sabor())}><IceCreamCone size={14} /> Agregar sabores</button>
        <button type="button" className="btn-soft btn-sm" onClick={() => addGroup(presets.extra())}><Sparkles size={14} /> Agregar adicionales</button>
        {groups.length > 0 && <button type="button" className="btn-ghost btn-sm" onClick={() => addGroup({ name: "", type: "single", required: false, choices: [{ name: "", price: 0 }] })}><Plus size={14} /> Otro grupo</button>}
      </div>
      {groups.length === 0 && <p className="text-xs text-muted font-medium">Opcional. El cajero elegirá el sabor o los adicionales al agregar el producto al pedido; cada adicional puede sumar un extra al precio y descontar de un insumo del inventario.</p>}
    </div>
  );
}

function ChoiceRow({ choice, ings, autoFocus, onChange, onRemove, onEnter }: {
  choice: OptionChoice; ings: Ingredient[]; autoFocus?: boolean; onChange: (patch: Partial<OptionChoice>) => void; onRemove: () => void; onEnter: () => void;
}) {
  const base = ings.find((g) => g.id === choice.ingredient_id)?.unit || "u";
  const units = UNITS[base] || [base];
  const [unit, setUnit] = useState<string>(units.find((u) => u !== base) || base);
  const lastIng = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    // Al elegir o cambiar el insumo: muestra la subunidad práctica (g para kg, ml para L) y reinicia cantidad a 1.
    if (choice.ingredient_id && choice.ingredient_id !== lastIng.current) {
      const b = ings.find((g) => g.id === choice.ingredient_id)?.unit || "u";
      const us = UNITS[b] || [b];
      setUnit(us.find((u) => u !== b) || b);
      onChange({ qty: 1 });
    }
    lastIng.current = choice.ingredient_id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice.ingredient_id]);
  const shown = fromBaseQty(base, unit, Number(choice.qty) || 0);
  const hasConsumption = !!choice.ingredient_id;
  return (
    <div className="col-span-3 grid grid-cols-[1fr_110px_36px] gap-2 items-center">
      <input className="input h-10" placeholder="Ej: Chocolate" value={choice.name} autoFocus={autoFocus} onChange={(e) => onChange({ name: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } }} />
      <input className="input h-10" type="number" step="0.1" min={0} placeholder="0" value={choice.price || ""} onChange={(e) => onChange({ price: Number(e.target.value) || 0 })} />
      <button type="button" className="btn-icon btn-ghost w-9 h-9 text-berry" title="Quitar" onClick={onRemove}><X size={15} /></button>
      <div className="col-span-3 flex flex-wrap items-center gap-2 mt-1">
        {!hasConsumption ? (
          <button type="button" className="btn-ghost btn-sm text-muted" onClick={() => onChange({ ingredient_id: ings[0]?.id || null, qty: 1 })}><Boxes size={13} /> Consumo de inventario</button>
        ) : (
          <>
            <select className="input h-9 text-sm max-w-[220px]" value={choice.ingredient_id ?? ""} onChange={(e) => { onChange({ ingredient_id: e.target.value ? Number(e.target.value) : null, qty: 1 }); setUnit(UNITS[ings.find((g) => g.id === Number(e.target.value))?.unit || "u"]?.find((u) => u !== (ings.find((g) => g.id === Number(e.target.value))?.unit || "u")) || (ings.find((g) => g.id === Number(e.target.value))?.unit || "u")); }}>
              <option value="">— Insumo —</option>
              {ings.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}
            </select>
            <div className="flex items-center gap-1">
              <input className="input h-9 w-28 text-right text-sm" type="number" step="any" min={0} value={shown} placeholder="0" onChange={(e) => onChange({ qty: toBaseQty(base, unit, Number(e.target.value) || 0) })} />
              <select className="input h-9 w-16 text-sm" value={unit} onChange={(e) => { onChange({ qty: toBaseQty(base, e.target.value, fromBaseQty(base, unit, Number(choice.qty) || 0)) }); setUnit(e.target.value); }}>
                {units.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <span className="text-[11px] font-bold text-muted">descuenta del insumo al vender</span>
            <button type="button" className="btn-icon btn-ghost w-8 h-8 text-berry" title="Quitar consumo" onClick={() => onChange({ ingredient_id: null, qty: undefined })}><X size={14} /></button>
          </>
        )}
      </div>
    </div>
  );
}