import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useInventory, stockStatus } from "../store";
import { Screen, listVariants, EmptyState } from "../ui";
import { ItemRow } from "./Home";
import { num } from "@/lib/format";

export default function Alerts() {
  const nav = useNavigate();
  const { items } = useInventory();
  const out = (items || []).filter((i) => stockStatus(i) === "out");
  const low = (items || []).filter((i) => stockStatus(i) === "low");

  return (
    <Screen title="Alertas" subtitle={items ? (out.length + low.length ? `${out.length + low.length} artículos por reponer` : "Todo el stock está en orden") : "Cargando…"}>
      {items && out.length + low.length === 0 ? <EmptyState emoji="🎉" title="Sin alertas" hint="Ningún artículo está por debajo de su mínimo." /> : (
        <motion.div variants={listVariants} initial="hidden" animate="show" className="pb-28">
          {out.length > 0 && <>
            <div className="text-[13px] font-bold uppercase tracking-wide text-berry mt-2 mb-2 px-1">Agotados · {out.length}</div>
            <div className="space-y-3">{out.map((i) => <ItemRow key={i.key} item={i} onClick={() => nav(`/app/item/${i.key}`)} hint={`Faltan ${num(i.min_stock, 2)} ${i.unit} para el mínimo`} />)}</div>
          </>}
          {low.length > 0 && <>
            <div className="text-[13px] font-bold uppercase tracking-wide text-[#d97706] mt-5 mb-2 px-1">Stock bajo · {low.length}</div>
            <div className="space-y-3">{low.map((i) => <ItemRow key={i.key} item={i} onClick={() => nav(`/app/item/${i.key}`)} hint={`Faltan ${num(Math.max(0, i.min_stock - i.stock), 2)} ${i.unit} para el mínimo`} />)}</div>
          </>}
        </motion.div>
      )}
    </Screen>
  );
}
