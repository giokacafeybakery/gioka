import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Search, X, ChevronRight } from "lucide-react";
import { PandaMark } from "@/components/Logo";
import { useAuth } from "@/store/auth";
import { useInventory, stockStatus, type Item } from "../store";
import { Screen, Card, Thumb, Chip, StatusTag, BackButton, listVariants, rowVariants, EmptyState, softSpring } from "../ui";
import { num, greeting } from "@/lib/format";

type Filter = "all" | "low" | "ingredient" | "product";

const todayLabel = () => {
  const d = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "short" }).replace(".", "");
  return d.charAt(0).toUpperCase() + d.slice(1);
};

export function ItemRow({ item, onClick, hint }: { item: Item; onClick: () => void; hint?: string }) {
  const st = stockStatus(item);
  return (
    <motion.div variants={rowVariants}>
      <Card onClick={onClick} className="p-3 flex items-center gap-3">
        <Thumb item={item} size={64} layoutId={`thumb-${item.key}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[16px] font-semibold text-ink truncate">{item.name}</div>
            <StatusTag status={st} />
          </div>
          <div className="text-[22px] font-bold tracking-tight leading-tight mt-0.5">
            {num(item.stock, 2)} <span className="text-[13px] font-semibold text-app-muted">{item.unit}</span>
            <span className="text-[13px] font-medium text-app-muted"> · mín {num(item.min_stock, 2)}</span>
          </div>
          <div className="text-[13px] text-app-muted truncate">{hint || `${item.subtitle}${item.usedIn != null ? ` · usado en ${item.usedIn}` : ""}`}</div>
        </div>
        <ChevronRight size={18} className="text-black/25 shrink-0" />
      </Card>
    </motion.div>
  );
}

export default function Home({ pick = false }: { pick?: boolean }) {
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const { items } = useInventory();
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>("all");

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items || []).filter((i) => (!s || i.name.toLowerCase().includes(s) || i.subtitle.toLowerCase().includes(s)) &&
      (f === "all" || (f === "low" ? stockStatus(i) !== "ok" : i.type === f)));
  }, [items, q, f]);
  const low = (items || []).filter((i) => stockStatus(i) !== "ok").length;

  const header = (
    <div className="shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3 bg-app">
      {pick ? (
        <>
          <div className="h-11 flex items-center"><BackButton to="/app" /></div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, ...softSpring }} className="pt-1">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-ink">¿Qué vas a ajustar?</h1>
            <p className="text-[15px] text-app-muted mt-0.5">Elige un insumo o producto</p>
          </motion.div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, ...softSpring }}>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-app-muted truncate">{greeting()} · {todayLabel()}</div>
              <h1 className="text-[28px] leading-[1.15] font-bold tracking-[-0.02em] text-ink truncate">{user?.name.split(" ")[0]}</h1>
            </div>
            <div className="w-12 h-12 rounded-full bg-white shadow-app grid place-items-center shrink-0"><PandaMark size={32} /></div>
          </div>
          {!items ? (
            <div className="mt-3 h-9 w-56 rounded-full bg-white/70 animate-pulse" />
          ) : (
            <motion.button whileTap={low ? { scale: 0.97 } : undefined} disabled={!low} onClick={() => setF(f === "low" ? "all" : "low")}
              className={`mt-3 inline-flex items-center gap-2 h-9 pl-3 rounded-full text-[13px] font-semibold ${low ? "pr-2 bg-butter-soft text-[#9a5b00]" : "pr-3.5 bg-mint-soft text-mint-2"}`}>
              <span className={`w-2 h-2 rounded-full ${low ? "bg-[#f59e0b]" : "bg-mint"}`} />
              {low ? `${low} ${low === 1 ? "artículo necesita" : "artículos necesitan"} reposición` : "Todo el stock está en orden"}
              {low > 0 && <ChevronRight size={16} className={`transition-transform ${f === "low" ? "rotate-90" : ""}`} />}
            </motion.button>
          )}
        </motion.div>
      )}
      <label className="mt-3 h-12 rounded-2xl bg-white shadow-app flex items-center gap-2.5 px-4">
        <Search size={18} className="text-app-muted shrink-0" />
        <input className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-app-muted/80" placeholder="Buscar por nombre o proveedor"
          value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" autoCapitalize="none" autoCorrect="off" />
        {q && (
          <button onClick={() => setQ("")} aria-label="Limpiar búsqueda" className="w-6 h-6 rounded-full bg-black/8 text-ink-3 grid place-items-center shrink-0">
            <X size={13} strokeWidth={2.5} />
          </button>
        )}
      </label>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 mt-3 pb-1">
        {([["all", "Todos"], ["low", "Stock bajo"], ["ingredient", "Insumos"], ["product", "Productos"]] as [Filter, string][]).map(([k, l]) => (
          <Chip key={k} active={f === k} onClick={() => setF(k)}>
            {k === "low" && low > 0 && <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle -mt-0.5 ${f === k ? "bg-[#fbbf24]" : "bg-[#f59e0b]"}`} />}
            {l}{k === "low" && low > 0 ? ` · ${low}` : ""}
          </Chip>
        ))}
      </div>
    </div>
  );

  return (
    <Screen hero={header}>
      {!items ? (
        <div className="space-y-3 pt-1">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[88px] rounded-[22px] bg-white/70 animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState emoji="🔍" title="Sin resultados" hint="Prueba con otra búsqueda o filtro." />
      ) : (
        <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-3 pt-1 pb-24">
          {list.map((i) => <ItemRow key={i.key} item={i} onClick={() => nav(pick ? `/app/item/${i.key}/ajustar` : `/app/item/${i.key}`)} />)}
        </motion.div>
      )}
    </Screen>
  );
}
