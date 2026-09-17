import { useEffect, type ReactNode } from "react";
import { X, Loader2, CheckCircle2, AlertCircle, Info, AlertTriangle, Search } from "lucide-react";
import { useToast } from "@/store/toast";

export function Modal({ open, onClose, title, subtitle, children, footer, width = "max-w-lg" }: {
  open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${width} bg-paper rounded-t-3xl sm:rounded-3xl shadow-pop anim-pop max-h-[92vh] flex flex-col`}>
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div>
              {title && <h3 className="text-xl font-black tracking-tight">{title}</h3>}
              {subtitle && <p className="text-sm text-muted font-semibold mt-0.5">{subtitle}</p>}
            </div>
            <button className="btn-icon btn-ghost -mr-2 -mt-1" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
          </div>
        )}
        <div className="px-6 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line flex justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted font-medium mt-1">{hint}</p>}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-muted ${className}`} />;
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-muted font-bold">
      <Spinner /> {label}
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 anim-fade-up">
      <div className="w-16 h-16 rounded-2xl bg-cream grid place-items-center text-muted mb-4">{icon ?? <Search size={26} />}</div>
      <div className="font-black text-lg">{title}</div>
      {hint && <p className="text-sm text-muted font-semibold mt-1 max-w-xs">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-3 cursor-pointer select-none">
      <span className={`relative w-12 h-7 rounded-full transition-colors ${checked ? "bg-mint" : "bg-line"}`}>
        <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </span>
      {label && <span className="font-bold text-sm">{label}</span>}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className = "" }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string;
}) {
  return (
    <div className={`inline-flex bg-cream rounded-xl p-1 gap-1 ${className}`}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`px-3.5 h-9 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${value === o.value ? "bg-paper shadow-soft text-ink" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone = "ink", icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ink" | "peach" | "mint" | "sky" | "berry" | "butter" | "lilac"; icon?: ReactNode }) {
  const tones: Record<string, string> = {
    ink: "bg-ink text-white", peach: "bg-peach-soft text-peach-2", mint: "bg-mint-soft text-mint-2", sky: "bg-sky-soft text-[#0f6f95]",
    berry: "bg-berry-soft text-berry", butter: "bg-butter-soft text-[#9a6b00]", lilac: "bg-lilac-soft text-[#6b3fc4]",
  };
  return (
    <div className="card p-4 flex items-start gap-3 min-w-0">
      {icon && <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${tones[tone]}`}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-[12px] font-extrabold uppercase tracking-wider text-muted truncate">{label}</div>
        <div className="text-2xl font-black tracking-tight leading-tight truncate">{value}</div>
        {sub && <div className="text-xs font-bold text-muted mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToast();
  const icon = { success: <CheckCircle2 className="text-mint" />, error: <AlertCircle className="text-berry" />, info: <Info className="text-sky" />, warning: <AlertTriangle className="text-butter" /> };
  return (
    <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto card shadow-lift p-3.5 flex items-start gap-3 anim-fade-up">
          <div className="shrink-0 mt-0.5">{icon[t.kind]}</div>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-[15px] leading-snug">{t.title}</div>
            {t.message && <div className="text-sm text-muted font-semibold mt-0.5">{t.message}</div>}
          </div>
          <button className="text-muted hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Cerrar"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}

export function ProductThumb({ emoji, image, color = "#F2915A", size = 56, className = "", rounded = "rounded-2xl" }: {
  emoji: string; image?: string | null; color?: string; size?: number; className?: string; rounded?: string;
}) {
  if (image) return <img src={image} alt="" className={`${rounded} object-cover shrink-0 ${className}`} style={{ width: size, height: size }} />;
  return (
    <div className={`${rounded} grid place-items-center shrink-0 ${className}`}
      style={{ width: size, height: size, background: `linear-gradient(145deg, ${color}33, ${color}66)`, fontSize: size * 0.5, lineHeight: 1 }}>
      <span className="drop-shadow-sm">{emoji}</span>
    </div>
  );
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = "Confirmar", danger = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-sm"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className={danger ? "btn-danger" : "btn-primary"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button></>}>
      {message && <div className="text-[15px] text-ink-3 font-semibold">{message}</div>}
    </Modal>
  );
}
