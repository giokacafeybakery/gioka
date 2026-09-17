import { create } from "zustand";

export type ToastKind = "success" | "error" | "info" | "warning";
export interface Toast { id: number; kind: ToastKind; title: string; message?: string }

interface ToastState { toasts: Toast[]; push: (kind: ToastKind, title: string, message?: string) => void; dismiss: (id: number) => void }

let seq = 1;
export const useToast = create<ToastState>()((set) => ({
  toasts: [],
  push: (kind, title, message) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, title, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === "error" ? 6000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (t: string, m?: string) => useToast.getState().push("success", t, m),
  error: (t: string, m?: string) => useToast.getState().push("error", t, m),
  info: (t: string, m?: string) => useToast.getState().push("info", t, m),
  warning: (t: string, m?: string) => useToast.getState().push("warning", t, m),
};
