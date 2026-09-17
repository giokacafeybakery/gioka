import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronLeft } from "lucide-react";
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
      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${padded ? "px-4" : ""} pb-6`}>{children}</div>
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
    <motion.div layoutId={layoutId} className="shrink-0 rounded-2xl overflow-hidden grid place-items-center" style={{ width: size, height: size, background: `linear-gradient(145deg, ${item.color}26, ${item.color}5c)` }}>
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

export function StatusTag({ status }: { status: "out" | "low" | "ok" }) {
  const m = { out: ["Agotado", "text-berry"], low: ["Stock bajo", "text-[#d97706]"], ok: ["En stock", "text-mint-2"] }[status];
  return <span className={`text-[12px] font-semibold ${m[1]}`}>{m[0]}</span>;
}

export function StockBar({ stock, min }: { stock: number; min: number }) {
  const pct = Math.max(0, Math.min(100, min > 0 ? (stock / (min * 2)) * 100 : stock > 0 ? 100 : 0));
  const c = stock <= 0 ? "bg-berry" : stock <= min ? "bg-[#f59e0b]" : "bg-mint";
  return (
    <div className="h-2 rounded-full bg-black/5 overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.15, ...softSpring }} className={`h-full rounded-full ${c}`} />
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
