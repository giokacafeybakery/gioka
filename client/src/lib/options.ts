import type { OptionGroup, SelectedOption } from "@/lib/types";

/** Helpers for sabores / adicionales (product option groups and the selection stored on an order line). */

/** Extra added to the unit price by the chosen options. */
export const optionsExtra = (options: SelectedOption[] | undefined) => +(options || []).reduce((s, o) => s + (Number(o.price) || 0), 0).toFixed(2);

/** Selection grouped by group name, in the order the groups were chosen: [["Sabor", ["Chocolate"]], ["Adicionales", ["Chispas", "Crema"]]]. */
export function optionsByGroup(options: SelectedOption[] | undefined): [string, string[]][] {
  const by = new Map<string, string[]>();
  for (const o of options || []) by.set(o.group, [...(by.get(o.group) || []), o.name]);
  return [...by];
}

/** "Sabor: Chocolate · Adicionales: Chispas, Crema" — one line for lists, tickets and the KDS. */
export const optionsSummary = (options: SelectedOption[] | undefined, sep = " · ") =>
  optionsByGroup(options).map(([g, names]) => (g ? `${g}: ` : "") + names.join(", ")).join(sep);

/** Just the choice names: "Chocolate, Chispas". */
export const optionsNames = (options: SelectedOption[] | undefined) => (options || []).map((o) => o.name).join(", ");

/** "Helado 1 bola (Chocolate, Chispas)" — item name with its choices, for compact lists. */
export const itemLabel = (it: { name: string; options?: SelectedOption[] }) => { const n = optionsNames(it.options); return n ? `${it.name} (${n})` : it.name; };

/** Stable key of a selection so the same product with the same choices shares one cart line. */
export const optionsKey = (options: SelectedOption[] | undefined) =>
  (options || []).map((o) => `${o.group}=${o.name}`).sort().join("|");

/** First unmet rule of the groups for a selection, or null when it can be added to the order. */
export function optionsError(groups: OptionGroup[] | undefined, options: SelectedOption[]): string | null {
  for (const g of groups || []) {
    const n = options.filter((o) => o.group === g.name).length;
    if (g.required && n === 0) return `Elige ${g.name.toLowerCase()}`;
    if (g.type === "single" && n > 1) return `Solo una opción de ${g.name.toLowerCase()}`;
  }
  return null;
}
