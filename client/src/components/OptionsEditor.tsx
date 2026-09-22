import { useEffect, useRef, useState } from "react";
import { Plus, X, IceCreamCone, Sparkles, GripVertical, Boxes, Search } from "lucide-react";
import { Segmented, Toggle } from "@/components/ui";
import type { Ingredient, OptionChoice, OptionGroup } from "@/lib/types";

/* Unidades alternativas por insumo: el consumo de una opción se guarda en la unidad base del
   insumo y el editor permite escribir en la unidad más práctica (g para kg, ml para L, etc.). */
const UNITS: Record<string, string[]> = { kg: ["g", "kg"], L: ["ml", "L"], g: ["g"], ml: ["ml"], u: ["u"], caja: ["caja"], paq: ["paq"] };
const toBaseQty = (base: string, disp: string, v: number) => (disp === "g" && base === "kg") || (disp === "ml" && base === "L") ? v / 1000 : v;
const fromBaseQty = (base: string, disp: string, v: number) => (disp === "g" && base === "kg") || (disp === "ml" && base === "L") ? v * 1000 : v;
const sortIngs = (a: Ingredient, b: Ingredient) => (Number(b.is_topping) - Number(a.is_topping)) || a.name.localeCompare(b.name);

/**
 * Admin editor for a product's sabores y adicionales. Each group has a name, a mode (one choice / several),
 * whether the cashier must choose, and its choices with an optional extra price.
 * A choice may optionally consume an ingredient (stock) when sold, with its own quantity and unit.
 * Ingredients marked "es complemento" are listed up top for quick adding (search box).
 */
export function OptionsEditor({ value, onChange, ings }: { value: OptionGroup[]; onChange: (groups: OptionGroup[]) => void; ings: Ingredient[] }) {
  const groups = value || [];
  const setGroup = (i: number, patch: Partial<OptionGroup>) => onChange(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const addGroup = (g: OptionGroup) => onChange([...groups, g]);
  const presets = {
    sabor: (): OptionGroup => ({ name: "Sabor", type: "single", required: true, choices: [{ name: "", price: 0 }] }),
    extra: (): OptionGroup => ({ name: "Adicionales", type: "multi", required: false, choices: [{ name: "", price: 0 }] }),
  };

  const toppings = ings.filter((i) => i.is_topping);
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const alreadyUsed = (id: number) => groups.some((g) => g.choices.some((c) => c.ingredient_id === id));
  const byQ = (i: Ingredient) => !s || i.name.toLowerCase().includes(s);
  const toppingList = toppings.filter((i) => !alreadyUsed(i.id)).filter(byQ);
  const otherList = ings.filter((i) => !alreadyUsed(i.id)).filter(byQ);

  const addFromInventory = (ing: Ingredient) => {
    let next = groups;
    let idx = groups.findIndex((g) => g.type === "multi" && g.choices.length && g.choices.some((c) => c.name));
    if (idx < 0) {
      const g = presets.extra();
      next = [...groups, g];
      idx = next.length - 1;
    }
    const g = next[idx];
    const withChoice = { ...g, choices: [...g.choices, { name: ing.name, price: 0, ingredient_id: ing.id, qty: 1 }] };
    onChange(next.map((x, j) => (j === idx ? withChoice : x)));
    setQ("");
  };

  return (
    <div className="space-y-3">
      {ings.length > 0 && (
        <div className="rounded-2xl border border-peach/40 bg-peach-soft/40 p-3">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-peach-2">
            <Boxes size={13} /> Del inventario
          </div>
          <div className="relative mt-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input h-9 pl-9" placeholder="Buscar insumo…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {toppingList.length > 0 && (
            <>
              <div className="mt-2 text-[10px] font-extrabold uppercase tracking-wide text-muted">Complementos</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {toppingList.map((ing) => (
                  <button key={ing.id} type="button" onClick={() => addFromInventory(ing)}
                    className="chip bg-paper border border-peach/40 text-ink-3 hover:bg-peach-soft transition"><Plus size={12} /> {ing.name} <span className="text-[10px] text-muted font-bold">({ing.unit})</span></button>
                ))}
              </div>
            </>
          )}
          {otherList.length > 0 && (
            <>
              <div className="mt-2 text-[10px] font-extrabold uppercase tracking-wide text-muted">Otros insumos</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {otherList.map((ing) => (
                  <button key={ing.id} type="button" onClick={() => addFromInventory(ing)}
                    className="chip bg-paper border border-line text-ink-3 hover:bg-cream transition"><Plus size={12} /> {ing.name} <span className="text-[10px] text-muted font-bold">({ing.unit})</span></button>
                ))}
              </div>
            </>
          )}
          {toppingList.length === 0 && otherList.length === 0 && <p className="text-xs text-muted font-semibold mt-2">Esos ya están en las opciones.</p>}
        </div>
      )}

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
              <ChoiceRow key={c.ingredient_id ? `i${c.ingredient_id}` : k} choice={c} ings={ings} autoFocus={c.name === "" && k === g.choices.length - 1}
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
  const sorted = [...ings].sort(sortIngs);
  const toppings = sorted.filter((g) => g.is_topping);
  const pick = (id: number | string) => {
    const ing = ings.find((g) => g.id === Number(id));
    const b = ing?.unit || "u";
    const us = UNITS[b] || [b];
    setUnit(us.find((u) => u !== b) || b);
    onChange({ ingredient_id: id ? Number(id) : null, qty: 1 });
  };
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
            <select className="input h-9 text-sm max-w-[220px]" value={choice.ingredient_id ?? ""} onChange={(e) => pick(e.target.value)}>
              <option value="">— Insumo —</option>
              {toppings.length > 0 && <optgroup label="Complementos">{toppings.map((g) => <option key={`c${g.id}`} value={g.id}>{g.name} ({g.unit})</option>)}</optgroup>}
              <optgroup label="Todos los insumos">{sorted.map((g) => <option key={`a${g.id}`} value={g.id}>{g.name} ({g.unit})</option>)}</optgroup>
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