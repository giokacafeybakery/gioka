import { create } from "zustand";

interface AppUpdateState {
  available: boolean;
  updating: boolean;
  installer: (() => Promise<void>) | null;
  announce: (installer: () => Promise<void>) => void;
  apply: () => Promise<void>;
}

export const useAppUpdate = create<AppUpdateState>()((set, get) => ({
  available: false,
  updating: false,
  installer: null,
  announce: (installer) => set({ available: true, installer }),
  apply: async () => {
    const installer = get().installer;
    if (!installer || get().updating) return;
    set({ updating: true });
    try {
      await installer();
    } catch (error) {
      set({ updating: false });
      throw error;
    }
  },
}));
