import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OrderType, Product } from "@/lib/types";

export interface CartLine { product: Product; qty: number; notes: string }

interface CartState {
  lines: CartLine[];
  type: OrderType;
  customerName: string;
  customerPhone: string;
  tableNo: string;
  notes: string;
  discount: number;
  add: (p: Product) => void;
  setQty: (id: number, qty: number) => void;
  setNotes: (id: number, notes: string) => void;
  remove: (id: number) => void;
  clear: () => void;
  set: (patch: Partial<Pick<CartState, "type" | "customerName" | "customerPhone" | "tableNo" | "notes" | "discount">>) => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [], type: "takeaway", customerName: "", customerPhone: "", tableNo: "", notes: "", discount: 0,
      add: (p) => set((s) => {
        const i = s.lines.findIndex((l) => l.product.id === p.id);
        if (i >= 0) { const lines = [...s.lines]; lines[i] = { ...lines[i], qty: lines[i].qty + 1 }; return { lines }; }
        return { lines: [...s.lines, { product: p, qty: 1, notes: "" }] };
      }),
      setQty: (id, qty) => set((s) => ({ lines: qty <= 0 ? s.lines.filter((l) => l.product.id !== id) : s.lines.map((l) => (l.product.id === id ? { ...l, qty } : l)) })),
      setNotes: (id, notes) => set((s) => ({ lines: s.lines.map((l) => (l.product.id === id ? { ...l, notes } : l)) })),
      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.product.id !== id) })),
      clear: () => set({ lines: [], customerName: "", customerPhone: "", tableNo: "", notes: "", discount: 0 }),
      set: (patch) => set(patch),
    }),
    { name: "gioka-cart" },
  ),
);

export const cartTotals = (lines: CartLine[], discount: number, taxRate: number) => {
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const disc = Math.min(subtotal, Math.max(0, discount || 0));
  const tax = +(((subtotal - disc) * (taxRate || 0)) / 100).toFixed(2);
  return { subtotal, discount: disc, tax, total: +(subtotal - disc + tax).toFixed(2), count: lines.reduce((s, l) => s + l.qty, 0) };
};
