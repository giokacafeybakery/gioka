import { create } from "zustand";
import { api } from "@/lib/api";
import type { Settings } from "@/lib/types";

interface SettingsState {
  settings: Settings | null;
  load: () => Promise<void>;
  save: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsState>()((set) => ({
  settings: null,
  load: async () => set({ settings: await api.get<Settings>("/api/settings") }),
  save: async (patch) => set({ settings: await api.put<Settings>("/api/settings", patch) }),
}));
