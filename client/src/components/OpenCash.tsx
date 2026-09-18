import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Lock, Mail, Unlock, Wallet, X } from "lucide-react";
import { Modal, Field } from "./ui";
import { FaceUnlock, type FaceUnlockPhase } from "./FaceUnlock";
import { useSocket } from "@/lib/socket";
import { openCash } from "@/lib/actions";
import { useCash } from "@/store/cash";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import { PandaMark } from "./Logo";
import { toast } from "@/store/toast";
import type { CashSession } from "@/lib/types";

export { useCash };

/** Keeps the cash session in sync (initial load + socket). Call once per page that depends on it. */
export function useCashSession() {
  const { session, load, set } = useCash();
  useEffect(() => { if (session === undefined) load(); }, [session, load]);
  useSocket({ "cash:updated": (s: CashSession | null) => set(s), "sync:changed": () => load() });
  return session;
}

type Status = "idle" | "checking" | "wrong" | "verified";

/** Modal: open the register with opening amount + the cashier's email and password.
 *  Dark hero with a Face ID-style scanner that loops while the form is filled; once the credentials are accepted it
 *  draws the checkmark and only then the modal closes. A wrong password shakes the scanner and flags the field. */
export function OpenCashModal({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened?: (s: CashSession) => void }) {
  const me = useAuth((s) => s.user);
  const currency = useSettings((s) => s.settings?.currency ?? "$");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState(me?.email || "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [shake, setShake] = useState(0);
  const [opened, setOpened] = useState<{ session: CashSession; queued: boolean } | null>(null);

  useEffect(() => { if (open) { setAmount(""); setPassword(""); setShowPw(false); setNotes(""); setEmail(me?.email || ""); setStatus("idle"); setShake(0); setOpened(null); } }, [open, me?.email]);

  const busy = status === "checking" || status === "verified";
  const verified = status === "verified";
  const wrong = status === "wrong";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setStatus("checking");
    try {
      const { result, queued } = await openCash({ opening_amount: Number(amount), email: email.trim(), password, notes });
      setOpened({ session: result, queued }); setStatus("verified"); // the checkmark animation finishes before the modal closes (see finish)
    } catch (err) {
      toast.error("No se pudo abrir la caja", (err as Error).message);
      setPassword(""); setShake((n) => n + 1); setStatus("wrong");
    }
  };

  const finish = () => {
    if (!opened) return;
    useCash.getState().set(opened.session);
    toast.success("Caja abierta", opened.queued ? `Turno de ${opened.session.user_name} · se enviará al volver la conexión` : `Turno de ${opened.session.user_name}`);
    onOpened?.(opened.session); onClose();
  };

  const statusText = { idle: "Esperando tus credenciales", checking: "Verificando identidad…", wrong: "Contraseña incorrecta", verified: "Identidad verificada" }[status];
  const statusTone = verified ? "bg-mint/15 text-[#a6f897] ring-1 ring-mint/40" : wrong ? "bg-berry/15 text-[#ffb3b6] ring-1 ring-berry/40" : "bg-white/[0.07] text-white/70 ring-1 ring-white/10";

  return (
    <Modal open={open} onClose={onClose} width="max-w-sm" flush>
      {/* Hero: dark panel with the scanner (same ink as the login splash). Gradients instead of blur so phones stay smooth. */}
      <div key={shake} className={`relative overflow-hidden bg-ink text-white ${shake ? "anim-shake" : ""}`}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(60% 55% at 50% 45%, rgba(166,248,151,0.14), transparent 70%), radial-gradient(40% 40% at 100% 0%, rgba(242,145,90,0.16), transparent 70%), radial-gradient(40% 40% at 0% 100%, rgba(95,191,230,0.12), transparent 70%)" }} />
        <div className="relative flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-2.5">
            <PandaMark size={30} ink="#FFFDF8" />
            <div className="leading-tight">
              <div className="text-[13px] font-extrabold tracking-tight">Abrir caja</div>
              <div className="text-[11px] font-semibold text-white/50">Inicio de turno</div>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={verified} className="w-9 h-9 grid place-items-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition disabled:opacity-30" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="relative flex flex-col items-center pb-5 -mt-1 select-none">
          <div className="w-[236px] h-[186px] will-change-transform"><FaceUnlock phase={verified ? "success" : "scan"} onDone={finish} className="w-full h-full" /></div>
          <div className={`-mt-4 inline-flex items-center gap-2 rounded-full px-3.5 h-8 text-[13px] font-bold transition-colors ${statusTone}`} aria-live="polite">
            {verified ? <Check size={14} strokeWidth={3} /> : <span className={`w-2 h-2 rounded-full ${wrong ? "bg-berry" : "bg-[#a6f897]"} ${status === "checking" ? "anim-ring" : ""}`} />}
            {statusText}
          </div>
          {me && <div className="mt-3 text-[12px] font-semibold text-white/45">Turno a nombre de <span className="text-white/80">{me.name}</span></div>}
        </div>
      </div>

      <form onSubmit={submit} className={`px-6 pt-5 pb-6 space-y-3.5 transition-opacity duration-300 ${verified ? "opacity-40 pointer-events-none" : ""}`}>
        <Field label="Efectivo inicial en caja">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-muted">{currency}</span>
            <input autoFocus className="input h-14 pl-10 pr-12 text-2xl font-black tracking-tight tabular-nums" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <Wallet size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted/70" />
          </div>
        </Field>
        <Field label="Correo del cajero">
          <div className="relative"><Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-11" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        </Field>
        <Field label="Contraseña">
          <div className="relative">
            <Lock size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${wrong ? "text-berry" : "text-muted"}`} />
            <input className={`input pl-11 pr-12 ${wrong ? "border-berry focus:border-berry focus:ring-berry/15 bg-berry-soft/40" : ""}`} type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); if (wrong) setStatus("idle"); }} required />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center text-muted hover:text-ink rounded-lg" aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </Field>
        <Field label="Notas (opcional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: turno de la mañana" /></Field>
        <button type="submit" className={`btn-lg w-full mt-1 ${verified ? "btn-mint" : "btn-dark"}`} disabled={busy || amount === "" || !email || !password}>
          {verified ? <><Check size={20} strokeWidth={3} /> Caja abierta</> : status === "checking" ? <><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Verificando…</> : <><Unlock size={20} /> Abrir caja</>}
        </button>
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
