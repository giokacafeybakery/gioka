import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Search, SlidersHorizontal, ChevronRight } from "lucide-react";
import { PandaMark } from "@/components/Logo";
import { useAuth } from "@/store/auth";
import { useInventory, stockStatus, type Item } from "../store";
import { Screen, Card, Thumb, Chip, StatusTag, listVariants, rowVariants, EmptyState } from "../ui";
import { num, greeting } from "@/lib/format";

type Filter = "all" | "low" | "ingredient" | "product";

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

  return (
    <Screen
      title={pick ? "¿Qué vas a ajustar?" : <>{greeting()},<br />{user?.name.split(" ")[0]} <span className="inline-block anim-wiggle">👋</span></>}
      subtitle={pick ? "Elige un insumo o producto" : low ? `${low} ${low === 1 ? "artículo necesita" : "artículos necesitan"} reposición` : "Todo el stock está en orden"}
      back={pick ? "/app" : undefined}
      right={!pick && <div className="w-11 h-11 rounded-full bg-white shadow-app grid place-items-center"><PandaMark size={30} /></div>}>
      <div className="flex items-center gap-2 mb-3">
        <label className="flex-1 h-12 rounded-2xl bg-white shadow-app flex items-center gap-2 px-4">
          <Search size={18} className="text-app-muted" />
          <input className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-app-muted/80" placeholder="Buscar por nombre o proveedor" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setF(f === "low" ? "all" : "low")} className={`w-12 h-12 rounded-2xl grid place-items-center ${f === "low" ? "bg-peach text-white" : "bg-peach-soft text-peach-2"}`} aria-label="Filtro stock bajo">
          <SlidersHorizontal size={20} />
        </motion.button>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {([["all", "Todos"], ["low", `Stock bajo${low ? ` · ${low}` : ""}`], ["ingredient", "Insumos"], ["product", "Productos"]] as [Filter, string][]).map(([k, l]) => (
          <Chip key={k} active={f === k} onClick={() => setF(k)}>{l}</Chip>
        ))}
      </div>

      {!items ? (
        <div className="space-y-3 mt-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[88px] rounded-[22px] bg-white/70 animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState emoji="🔍" title="Sin resultados" hint="Prueba con otra búsqueda o filtro." />
      ) : (
        <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-3 mt-4 pb-24">
          {list.map((i) => <ItemRow key={i.key} item={i} onClick={() => nav(pick ? `/app/item/${i.key}/ajustar` : `/app/item/${i.key}`)} />)}
        </motion.div>
      )}
    </Screen>
  );
}
