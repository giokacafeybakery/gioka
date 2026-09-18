import { Plus, X, IceCreamCone, Sparkles, GripVertical } from "lucide-react";
import { Segmented, Toggle } from "@/components/ui";
import type { OptionGroup } from "@/lib/types";

/**
 * Admin editor for a product's sabores y adicionales. Each group has a name, a mode (one choice / several),
 * whether the cashier must choose, and its choices with an optional extra price.
 */
export function OptionsEditor({ value, onChange }: { value: OptionGroup[]; onChange: (groups: OptionGroup[]) => void }) {
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
              <ChoiceRow key={k} name={c.name} price={c.price} autoFocus={c.name === "" && k === g.choices.length - 1}
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
      {groups.length === 0 && <p className="text-xs text-muted font-medium">Opcional. El cajero elegirá el sabor o los adicionales al agregar el producto al pedido; cada adicional puede sumar un extra al precio.</p>}
    </div>
  );
}

function ChoiceRow({ name, price, autoFocus, onChange, onRemove, onEnter }: {
  name: string; price: number; autoFocus?: boolean; onChange: (patch: { name?: string; price?: number }) => void; onRemove: () => void; onEnter: () => void;
}) {
  return (
    <>
      <input className="input h-10" placeholder="Ej: Chocolate" value={name} autoFocus={autoFocus} onChange={(e) => onChange({ name: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } }} />
      <input className="input h-10" type="number" step="0.1" min={0} placeholder="0" value={price || ""} onChange={(e) => onChange({ price: Number(e.target.value) || 0 })} />
      <button type="button" className="btn-icon btn-ghost w-9 h-9 text-berry" title="Quitar" onClick={onRemove}><X size={15} /></button>
    </>
  );
}
