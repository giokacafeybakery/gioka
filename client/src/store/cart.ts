import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OrderType, Product, SelectedOption } from "@/lib/types";
import { optionsExtra, optionsKey } from "@/lib/options";

/** A cart line is one product with one specific selection of sabores/adicionales; `key` identifies that pair. */
export interface CartLine { key: string; product: Product; qty: number; notes: string; options: SelectedOption[] }

export const lineKey = (productId: number, options: SelectedOption[] | undefined) => `${productId}|${optionsKey(options)}`;
/** Unit price of the line: product price plus the extras of its options. */
export const lineUnitPrice = (l: Pick<CartLine, "product" | "options">) => +(l.product.price + optionsExtra(l.options)).toFixed(2);

interface CartState {
  lines: CartLine[];
  type: OrderType;
  customerName: string;
  customerPhone: string;
  tableNo: string;
  address: string;
  reference: string;
  notes: string;
  discount: number;
  /** Add one unit; the same product with the same options joins the existing line. */
  add: (p: Product, options?: SelectedOption[]) => void;
  setQty: (key: string, qty: number) => void;
  setNotes: (key: string, notes: string) => void;
  remove: (key: string) => void;
  clear: () => void;
  set: (patch: Partial<Pick<CartState, "type" | "customerName" | "customerPhone" | "tableNo" | "address" | "reference" | "notes" | "discount">>) => void;
}

/** Customer data required before an order can be created/charged (mirrors `customerError` on the server). */
export function customerError(type: OrderType, c: Pick<CartState, "customerName" | "customerPhone" | "tableNo" | "address" | "reference">): string | null {
  const has = (v: string) => v.trim().length > 0;
  if (type === "dinein") return has(c.tableNo) ? null : "Indica el número de mesa";
  if (!has(c.customerName)) return "Indica el nombre del cliente";
  if (type === "delivery") {
    if (!has(c.customerPhone)) return "Indica el teléfono del cliente";
    if (!has(c.address)) return "Indica la dirección de entrega";
    if (!has(c.reference)) return "Indica un punto de referencia para el repartidor";
  }
  return null;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [], type: "takeaway", customerName: "", customerPhone: "", tableNo: "", address: "", reference: "", notes: "", discount: 0,
      add: (p, options = []) => set((s) => {
        const key = lineKey(p.id, options);
        const i = s.lines.findIndex((l) => l.key === key);
        if (i >= 0) { const lines = [...s.lines]; lines[i] = { ...lines[i], qty: lines[i].qty + 1 }; return { lines }; }
        return { lines: [...s.lines, { key, product: p, qty: 1, notes: "", options }] };
      }),
      setQty: (key, qty) => set((s) => ({ lines: qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, qty } : l)) })),
      setNotes: (key, notes) => set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, notes } : l)) })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [], customerName: "", customerPhone: "", tableNo: "", address: "", reference: "", notes: "", discount: 0 }),
      set: (patch) => set(patch),
    }),
    {
      name: "gioka-cart",
      version: 2,
      // v1 lines had no key/options: give them the plain-product key so a cart saved before the update keeps working.
      migrate: (state) => {
        const s = state as Partial<CartState>;
        return { ...s, lines: (s.lines || []).map((l) => ({ ...l, options: l.options || [], key: l.key || lineKey(l.product.id, l.options || []) })) } as CartState;
      },
    },
  ),
);

export const cartTotals = (lines: CartLine[], discount: number, taxRate: number) => {
  const subtotal = +lines.reduce((s, l) => s + lineUnitPrice(l) * l.qty, 0).toFixed(2);
  const disc = Math.min(subtotal, Math.max(0, discount || 0));
  const tax = +(((subtotal - disc) * (taxRate || 0)) / 100).toFixed(2);
  return { subtotal, discount: disc, tax, total: +(subtotal - disc + tax).toFixed(2), count: lines.reduce((s, l) => s + l.qty, 0) };
};
