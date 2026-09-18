import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";
import type { Ingredient, Product } from "@/lib/types";

/** Unified inventory item used by the mobile app (ingredients + products with stock control). */
export interface Item {
  key: string;                       // "ingredient-3" | "product-12"
  type: "ingredient" | "product";
  id: number;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  cost: number;
  subtitle: string;                  // supplier / category
  emoji: string;
  image: string | null;
  color: string;
  usedIn?: number;
}

export interface Movement {
  id: number; item_type: "product" | "ingredient"; item_id: number; item_name: string; unit: string; qty: number; reason: string; notes: string;
  photo: string | null; order_id: number | null; order_number: number | null; user_name: string | null; user_role: string | null; created_at: string;
}

export const stockStatus = (i: { stock: number; min_stock: number }): "out" | "low" | "ok" => (i.stock <= 0 ? "out" : i.stock <= i.min_stock ? "low" : "ok");

interface InvState {
  items: Item[] | null;
  movements: Movement[];
  loading: boolean;
  load: () => Promise<void>;
  loadMovements: () => Promise<void>;
  byKey: (key: string) => Item | undefined;
}

// The last snapshot is kept in localStorage so the app paints instantly on open and then revalidates.
// Concurrent loads (several socket events in a row) are coalesced into one request.
let inflight: Promise<void> | null = null;
let inflightMov: Promise<void> | null = null;

export const useInventory = create<InvState>()(persist((set, get) => ({
  items: null,
  movements: [],
  loading: false,
  load: () => {
    if (inflight) return inflight;
    inflight = (async () => {
    set({ loading: true });
    try {
      const [ings, prods] = await Promise.all([api.get<Ingredient[]>("/api/inventory/ingredients"), api.get<Product[]>("/api/products?all=1")]);
      const items: Item[] = [
        ...ings.map((i) => ({ key: `ingredient-${i.id}`, type: "ingredient" as const, id: i.id, name: i.name, unit: i.unit, stock: i.stock, min_stock: i.min_stock, cost: i.cost, subtitle: i.supplier || "Insumo", emoji: "📦", image: null, color: "#5fbfe6", usedIn: i.used_in })),
        ...prods.filter((p) => p.track_stock).map((p) => ({ key: `product-${p.id}`, type: "product" as const, id: p.id, name: p.name, unit: "u", stock: p.stock, min_stock: p.min_stock, cost: p.cost, subtitle: p.category_name || "Producto", emoji: p.emoji, image: p.image, color: p.category_color || "#f2915a" })),
      ].sort((a, b) => a.name.localeCompare(b.name, "es"));
      set({ items, loading: false });
    } catch { set({ loading: false }); }
    })().finally(() => { inflight = null; });
    return inflight;
  },
  loadMovements: () => {
    if (inflightMov) return inflightMov;
    inflightMov = (async () => {
      try { set({ movements: await api.get<Movement[]>("/api/inventory/movements?limit=200") }); } catch { /* keep */ }
    })().finally(() => { inflightMov = null; });
    return inflightMov;
  },
  byKey: (key) => get().items?.find((i) => i.key === key),
}), { name: "gioka-inventory", version: 1, partialize: (s) => ({ items: s.items, movements: s.movements }) }));

/** Draft of the adjustment being made (survives across the adjust → confirm → done screens). */
export type Mode = "in" | "out" | "set";
interface FlowState {
  item: Item | null;
  mode: Mode;
  qty: string;
  photo: string | null;
  reason: string;
  notes: string;
  result: { before: number; after: number; delta: number; at: string } | null;
  start: (item: Item, mode?: Mode) => void;
  set: (patch: Partial<Pick<FlowState, "mode" | "qty" | "photo" | "reason" | "notes" | "result">>) => void;
  reset: () => void;
}
export const useFlow = create<FlowState>()((set) => ({
  item: null, mode: "in", qty: "", photo: null, reason: "compra", notes: "", result: null,
  start: (item, mode = "in") => set({ item, mode, qty: "", photo: null, reason: mode === "out" ? "merma" : mode === "set" ? "inventario" : "compra", notes: "", result: null }),
  set: (patch) => set(patch),
  reset: () => set({ item: null, mode: "in", qty: "", photo: null, reason: "compra", notes: "", result: null }),
}));

export const REASONS: Record<Mode, string[]> = {
  in: ["compra", "devolución", "producción", "ajuste"],
  out: ["merma", "consumo interno", "vencido", "ajuste"],
  set: ["inventario", "ajuste"],
};
