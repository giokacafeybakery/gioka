import { useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Modal, ProductThumb } from "@/components/ui";
import { money } from "@/lib/format";
import { optionsError, optionsExtra } from "@/lib/options";
import type { Product, SelectedOption } from "@/lib/types";

/**
 * Sabores y adicionales: the cashier picks the options of a product before it goes into the order.
 * `single` groups behave like radio buttons (tapping the chosen one again clears it when not required); `multi` toggle.
 */
export function OptionsPicker({ product, onClose, onAdd }: { product: Product | null; onClose: () => void; onAdd: (options: SelectedOption[]) => void }) {
  const [sel, setSel] = useState<SelectedOption[]>([]);
  // Fresh selection for every product; a required single group with one choice starts already picked.
  useEffect(() => {
    if (!product) return;
    setSel(product.options.flatMap((g) => (g.required && g.type === "single" && g.choices.length === 1 ? [{ group: g.name, name: g.choices[0].name, price: g.choices[0].price, ingredient_id: g.choices[0].ingredient_id, qty: g.choices[0].qty }] : [])));
  }, [product]);

  const error = useMemo(() => (product ? optionsError(product.options, sel) : null), [product, sel]);
  const unit = product ? +(product.price + optionsExtra(sel)).toFixed(2) : 0;

  const toggle = (group: Product["options"][number], choice: { name: string; price: number; ingredient_id?: number | null; qty?: number }) => {
    setSel((cur) => {
      const on = cur.some((o) => o.group === group.name && o.name === choice.name);
      const rest = cur.filter((o) => !(o.group === group.name && (group.type === "single" || o.name === choice.name)));
      return on ? rest : [...rest, { group: group.name, name: choice.name, price: choice.price, ingredient_id: choice.ingredient_id, qty: choice.qty }];
    });
  };
  const submit = () => { if (!product || error) return; onAdd(sel); };

  return (
    <Modal open={!!product} onClose={onClose} width="max-w-md"
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={!!error} onClick={submit}><Plus size={18} /> Agregar · {money(unit)}</button>
      </>}>
      {product && (
        <div className="anim-fade-up" onKeyDown={(e) => { if (e.key === "Enter") submit(); }}>
          <div className="flex items-center gap-3 mb-4">
            <ProductThumb emoji={product.emoji} image={product.image} color={product.category_color} size={56} rounded="rounded-2xl" />
            <div className="min-w-0">
              <div className="font-black text-lg leading-tight truncate">{product.name}</div>
              <div className="text-sm font-bold text-muted">{money(product.price)}{unit !== product.price && <span className="text-peach-2"> → {money(unit)}</span>}</div>
            </div>
          </div>
          <div className="space-y-5">
            {product.options.map((g) => {
              const picked = sel.filter((o) => o.group === g.name);
              const missing = g.required && picked.length === 0;
              return (
                <section key={g.name}>
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <h4 className="font-black text-[15px]">{g.name}</h4>
                    <span className={`text-[11px] font-extrabold uppercase tracking-wider ${missing ? "text-berry" : "text-muted"}`}>
                      {g.type === "single" ? "Elige uno" : "Elige los que quieras"}{g.required ? " · obligatorio" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {g.choices.map((c) => {
                      const on = picked.some((o) => o.name === c.name);
                      return (
                        <button key={c.name} type="button" onClick={() => toggle(g, c)} aria-pressed={on}
                          className={`h-12 px-3 rounded-xl border-2 flex items-center gap-2 text-left transition ${on ? "border-peach bg-peach-soft text-peach-2" : "border-line bg-paper text-ink hover:border-ink/20"}`}>
                          <span className={`w-5 h-5 shrink-0 grid place-items-center ${g.type === "single" ? "rounded-full" : "rounded-md"} border-2 ${on ? "bg-peach border-peach text-white" : "border-line"}`}>{on && <Check size={13} strokeWidth={3} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-extrabold text-[14px] leading-tight truncate">{c.name}</span>
                            {c.price > 0 && <span className={`block text-[11px] font-bold ${on ? "text-peach-2" : "text-muted"}`}>+{money(c.price)}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
