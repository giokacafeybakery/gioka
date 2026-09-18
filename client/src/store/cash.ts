import { create } from "zustand";
import { api } from "@/lib/api";
import type { CashSession } from "@/lib/types";

/** Shared state of the current cash session (null = closed, undefined = not loaded yet). Offline-aware through api.get. */
interface CashState { session: CashSession | null | undefined; load: () => Promise<void>; set: (s: CashSession | null) => void }
export const useCash = create<CashState>()((set) => ({
  session: undefined,
  load: async () => { try { set({ session: await api.get<CashSession | null>("/api/cash/current") }); } catch { set((s) => ({ session: s.session === undefined ? null : s.session })); } },
  set: (session) => set({ session }),
}));
