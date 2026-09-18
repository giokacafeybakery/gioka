import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, X, Delete } from "lucide-react";
import type { Item } from "./store";

export const spring = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;
export const softSpring = { type: "spring", stiffness: 260, damping: 28 } as const;

/** Apple-style screen: optional nav bar with back chevron + large title, scrollable body, optional sticky footer. */
export function Screen({ title, subtitle, back, right, children, footer, hero, padded = true }: {
  title?: ReactNode; subtitle?: ReactNode; back?: boolean | string; right?: ReactNode; children: ReactNode; footer?: ReactNode; hero?: ReactNode; padded?: boolean;
}) {
  return (
    <div className="absolute inset-0 flex flex-col bg-app font-app">
      {(back || right || title) && !hero && (
        <div className="shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)]">
          <div className="h-11 flex items-center gap-2">
            {back && <BackButton to={typeof back === "string" ? back : undefined} />}
            <div className="flex-1 min-w-0" />
            {right}
          </div>
          {title && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, ...softSpring }} className="pt-1 pb-3">
              <h1 className="text-[30px] leading-tight font-bold tracking-[-0.02em] text-ink">{title}</h1>
              {subtitle && <p className="text-[15px] text-app-muted mt-0.5">{subtitle}</p>}
            </motion.div>
          )}
        </div>
      )}
      {hero}
      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${padded ? "px-4" : ""} pb-8`}>{children}</div>
      {footer && <div className="shrink-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] bg-app/90 backdrop-blur border-t border-black/5">{footer}</div>}
    </div>
  );
}

export function BackButton({ to, light = false }: { to?: string; light?: boolean }) {
  const nav = useNavigate();
  return (
    <motion.button whileTap={{ scale: 0.9 }} onClick={() => (to ? nav(to) : nav(-1))} aria-label="Volver"
      className={`w-10 h-10 rounded-full grid place-items-center ${light ? "bg-white/25 text-white backdrop-blur" : "bg-white text-ink shadow-app"}`}>
      <ChevronLeft size={22} strokeWidth={2.5} className="-ml-0.5" />
    </motion.button>
  );
}

export function Card({ children, className = "", onClick, layoutId }: { children: ReactNode; className?: string; onClick?: () => void; layoutId?: string }) {
  return (
    <motion.div layoutId={layoutId} whileTap={onClick ? { scale: 0.98 } : undefined} onClick={onClick}
      className={`bg-white rounded-[22px] shadow-app ${onClick ? "cursor-pointer active:bg-neutral-50" : ""} ${className}`}>
      {children}
    </motion.div>
  );
}

export function Thumb({ item, size = 64, layoutId }: { item: Item; size?: number; layoutId?: string }) {
  return (
    <motion.div layoutId={layoutId} className="shrink-0 overflow-hidden grid place-items-center" style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), background: `linear-gradient(145deg, ${item.color}26, ${item.color}5c)` }}>
      {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : <span style={{ fontSize: size * 0.48, lineHeight: 1 }} className="drop-shadow-sm select-none">{item.emoji}</span>}
    </motion.div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <motion.button whileTap={{ scale: 0.94 }} onClick={onClick}
      className={`h-9 px-4 rounded-full text-[14px] font-semibold whitespace-nowrap transition-colors ${active ? "bg-ink text-white" : "bg-white text-ink-3 shadow-app"}`}>
      {children}
    </motion.button>
  );
}

export function BigButton({ children, onClick, variant = "primary", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "dark" | "soft" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  const v = {
    primary: "bg-mint text-white shadow-[0_10px_24px_-10px_rgba(79,189,145,0.9)]",
    dark: "bg-ink text-white",
    soft: "bg-white text-ink shadow-app",
    danger: "bg-berry text-white",
  }[variant];
  return (
    <motion.button type={type} whileTap={disabled ? undefined : { scale: 0.97 }} disabled={disabled} onClick={onClick}
      className={`w-full h-[54px] rounded-[18px] text-[17px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40 ${v}`}>
      {children}
    </motion.button>
  );
}

export function StatusTag({ status, pill = false }: { status: "out" | "low" | "ok"; pill?: boolean }) {
  const m = { out: ["Agotado", "text-berry", "bg-berry-soft"], low: ["Stock bajo", "text-[#b45309]", "bg-[#fdf1d4]"], ok: ["En stock", "text-mint-2", "bg-mint-soft"] }[status];
  if (pill) return <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-bold ${m[1]} ${m[2]}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{m[0]}</span>;
  return <span className={`text-[12px] font-semibold ${m[1]}`}>{m[0]}</span>;
}

export function StockBar({ stock, min, marker = false, height = 8 }: { stock: number; min: number; marker?: boolean; height?: number }) {
  const pct = Math.max(0, Math.min(100, min > 0 ? (stock / (min * 2)) * 100 : stock > 0 ? 100 : 0));
  const c = stock <= 0 ? "bg-berry" : stock <= min ? "bg-[#f59e0b]" : "bg-mint";
  return (
    <div className="relative">
      <div className="rounded-full bg-black/[0.06] overflow-hidden" style={{ height }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.15, ...softSpring }} className={`h-full rounded-full ${c}`} />
      </div>
      {marker && min > 0 && (
        <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-[3px] rounded-full bg-ink/40" style={{ height: height + 6 }} aria-hidden />
      )}
    </div>
  );
}

export const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } } };
export const rowVariants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: softSpring } };

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="flex items-baseline justify-between mt-5 mb-2 px-1"><h2 className="text-[17px] font-bold text-ink">{children}</h2>{right}</div>;
}

export function EmptyState({ emoji = "🐼", title, hint }: { emoji?: string; title: string; hint?: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-16">
      <div className="text-5xl mb-3">{emoji}</div>
      <div className="font-bold text-[17px]">{title}</div>
      {hint && <div className="text-app-muted text-[14px] mt-1">{hint}</div>}
    </motion.div>
  );
}

/* ---------------- Bottom sheet (portal, drag to dismiss) ---------------- */
export function Sheet({ open, onClose, children, title, subtitle, right }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-[2px] flex items-end justify-center font-app" onClick={onClose}>
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 420, damping: 40 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose(); }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[520px] bg-white rounded-t-[28px] px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] max-h-[88dvh] flex flex-col shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.3)]">
            <div className="mx-auto w-10 h-1.5 rounded-full bg-black/12 mb-3 shrink-0" />
            {(title || right) && (
              <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
                <div className="min-w-0">{title && <div className="text-[20px] font-bold truncate">{title}</div>}{subtitle && <div className="text-[13px] text-app-muted">{subtitle}</div>}</div>
                {right ?? <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/5 grid place-items-center shrink-0" aria-label="Cerrar"><X size={16} /></button>}
              </div>
            )}
            <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ---------------- Numeric keypad (replaces the system keyboard) ---------------- */
export function Keypad({ value, onChange, onDone, unit, hint, quick = [1, 5, 10, 25] }: { value: string; onChange: (v: string) => void; onDone: () => void; unit?: string; hint?: ReactNode; quick?: number[] }) {
  const press = (k: string) => {
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (k === ".") return onChange(value.includes(".") ? value : (value || "0") + ".");
    if (value === "0") return onChange(k);
    if (value.replace(".", "").length >= 7) return;
    onChange(value + k);
  };
  const add = (n: number) => onChange(String(+((Number(value || 0) + n).toFixed(3))));
  return (
    <div>
      <div className="text-center py-2">
        <div className="text-[52px] leading-none font-bold tracking-tight tabular-nums text-ink min-h-[56px]">{value || <span className="text-black/15">0</span>}<span className="text-[18px] font-semibold text-app-muted ml-1.5">{unit}</span></div>
        {hint && <div className="text-[13px] text-app-muted mt-2 min-h-[18px]">{hint}</div>}
      </div>
      <div className="flex gap-2 justify-center mb-3">{quick.map((n) => <Chip key={n} onClick={() => add(n)}>+{n}</Chip>)}</div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
          <motion.button key={k} whileTap={{ scale: 0.92, backgroundColor: "rgba(0,0,0,0.08)" }} onClick={() => press(k)}
            className={`h-[54px] rounded-2xl text-[24px] font-semibold ${k === "⌫" ? "text-berry bg-black/[0.04]" : "bg-black/[0.04] text-ink"}`}>
            {k === "⌫" ? <Delete size={24} className="mx-auto" /> : k}
          </motion.button>
        ))}
      </div>
      <div className="mt-3"><BigButton variant="dark" onClick={onDone}>Listo</BigButton></div>
    </div>
  );
}
