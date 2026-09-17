import { useEffect, useState } from "react";
import { create } from "zustand";
import { Lock, Mail, Unlock, Wallet } from "lucide-react";
import { Modal, Field } from "./ui";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/socket";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";
import type { CashSession } from "@/lib/types";

/** Shared state of the current cash session (null = closed, undefined = not loaded yet). */
interface CashState { session: CashSession | null | undefined; load: () => Promise<void>; set: (s: CashSession | null) => void }
export const useCash = create<CashState>()((set) => ({
  session: undefined,
  load: async () => { try { set({ session: await api.get<CashSession | null>("/api/cash/current") }); } catch { set({ session: null }); } },
  set: (session) => set({ session }),
}));

/** Keeps the cash session in sync (initial load + socket). Call once per page that depends on it. */
export function useCashSession() {
  const { session, load, set } = useCash();
  useEffect(() => { if (session === undefined) load(); }, [session, load]);
  useSocket({ "cash:updated": (s: CashSession | null) => set(s) });
  return session;
}

/** Modal: open the register with opening amount + the cashier's email and password. */
export function OpenCashModal({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened?: (s: CashSession) => void }) {
  const me = useAuth((s) => s.user);
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState(me?.email || "");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setAmount(""); setPassword(""); setNotes(""); setEmail(me?.email || ""); } }, [open, me?.email]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.post<CashSession>("/api/cash/open", { opening_amount: Number(amount), email: email.trim(), password, notes });
      useCash.getState().set(s);
      toast.success("Caja abierta", `Turno de ${s.user_name}`);
      onOpened?.(s); onClose();
    } catch (err) { toast.error("No se pudo abrir la caja", (err as Error).message); setPassword(""); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Abrir caja" subtitle="Registra el monto inicial e identifícate para iniciar tu turno" width="max-w-sm">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Efectivo inicial en caja">
          <div className="relative"><Wallet size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input autoFocus className="input h-12 pl-11 text-lg" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        </Field>
        <Field label="Correo del cajero">
          <div className="relative"><Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-11" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        </Field>
        <Field label="Contraseña">
          <div className="relative"><Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-11" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        </Field>
        <Field label="Notas (opcional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: turno de la mañana" /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={busy || amount === "" || !email || !password}><Unlock size={18} /> Abrir caja</button>
        </div>
      </form>
    </Modal>
  );
}

/** Full-page notice shown when selling is attempted with the register closed. */
export function CashClosedNotice({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex-1 grid place-items-center p-6">
      <div className="card p-8 max-w-md text-center anim-fade-up">
        <div className="mx-auto w-20 h-20 rounded-full bg-butter-soft text-[#9a6b00] grid place-items-center"><Lock size={34} /></div>
        <h2 className="text-2xl font-black mt-4">La caja está cerrada</h2>
        <p className="text-muted font-semibold mt-2">Para vender debes abrir la caja: registra el efectivo inicial e ingresa tu correo y contraseña de cajero.</p>
        <button className="btn-primary btn-lg mt-6" onClick={onOpen}><Unlock size={20} /> Abrir caja</button>
      </div>
    </div>
  );
}
