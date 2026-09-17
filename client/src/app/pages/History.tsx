import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownToLine, ArrowUpFromLine, Camera, X } from "lucide-react";
import { useInventory, type Movement } from "../store";
import { Screen, Chip, listVariants, rowVariants, EmptyState } from "../ui";
import { num, dateTime, time } from "@/lib/format";

const dayLabel = (iso: string) => {
  const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  return diff === 0 ? "Hoy" : diff === 1 ? "Ayer" : d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
};

export default function History() {
  const { movements } = useInventory();
  const [manual, setManual] = useState(true);
  const [open, setOpen] = useState<Movement | null>(null);

  const groups = useMemo(() => {
    const list = movements.filter((m) => !manual || m.order_id == null);
    const g: Record<string, Movement[]> = {};
    for (const m of list) (g[dayLabel(m.created_at)] ||= []).push(m);
    return Object.entries(g);
  }, [movements, manual]);

  return (
    <Screen title="Historial" subtitle="Entradas y salidas de stock">
      <div className="flex gap-2 -mx-4 px-4 overflow-x-auto no-scrollbar pb-1">
        <Chip active={manual} onClick={() => setManual(true)}>Ajustes manuales</Chip>
        <Chip active={!manual} onClick={() => setManual(false)}>Todo (incl. ventas)</Chip>
      </div>
      {groups.length === 0 ? <EmptyState emoji="🗂️" title="Sin movimientos" hint="Los ajustes que registres aparecerán aquí." /> : (
        <motion.div variants={listVariants} initial="hidden" animate="show" className="pb-28">
          {groups.map(([day, list]) => (
            <div key={day}>
              <div className="text-[13px] font-bold uppercase tracking-wide text-app-muted mt-5 mb-2 px-1 capitalize">{day}</div>
              <div className="bg-white rounded-[22px] shadow-app divide-y divide-black/5">
                {list.map((m) => (
                  <motion.button key={m.id} variants={rowVariants} whileTap={{ scale: 0.99 }} onClick={() => setOpen(m)} className="w-full text-left flex items-center gap-3 p-3">
                    <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${m.qty < 0 ? "bg-berry-soft text-berry" : "bg-mint-soft text-mint-2"}`}>{m.qty < 0 ? <ArrowUpFromLine size={18} /> : <ArrowDownToLine size={18} />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold truncate">{m.item_name}</div>
                      <div className="text-[12px] text-app-muted truncate capitalize">{m.reason}{m.order_number ? ` · pedido #${m.order_number}` : ""} · {time(m.created_at)}{m.user_name ? ` · ${m.user_name}` : ""}</div>
                    </div>
                    <div className={`text-[15px] font-bold tabular-nums ${m.qty < 0 ? "text-berry" : "text-mint-2"}`}>{m.qty > 0 ? "+" : ""}{num(m.qty, 2)} <span className="text-[11px] text-app-muted font-semibold">{m.unit}</span></div>
                    {m.photo ? <img src={m.photo} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" /> : <span className="w-11 h-11 rounded-xl bg-black/[0.04] grid place-items-center text-black/25 shrink-0"><Camera size={16} /></span>}
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center" onClick={() => setOpen(null)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }} onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[520px] bg-white rounded-t-[28px] p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] max-h-[88vh] overflow-y-auto">
              <div className="mx-auto w-10 h-1.5 rounded-full bg-black/10 mb-4" />
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-[20px] font-bold">{open.item_name}</div><div className="text-[13px] text-app-muted">{dateTime(open.created_at)}</div></div>
                <button onClick={() => setOpen(null)} className="w-9 h-9 rounded-full bg-black/5 grid place-items-center"><X size={16} /></button>
              </div>
              {open.photo && <img src={open.photo} alt="Comprobante" className="mt-4 w-full rounded-2xl object-contain max-h-[45vh] bg-black/5" />}
              <div className="mt-4 divide-y divide-black/5 text-[15px]">
                {[["Movimiento", <span className={`font-bold ${open.qty < 0 ? "text-berry" : "text-mint-2"}`}>{open.qty > 0 ? "+" : ""}{num(open.qty, 3)} {open.unit}</span>], ["Motivo", <span className="capitalize">{open.reason}</span>], open.notes ? ["Detalle", open.notes] : null, ["Usuario", open.user_name || "—"], open.order_number ? ["Pedido", `#${open.order_number}`] : null]
                  .filter(Boolean).map((r) => { const [l, v] = r as [string, React.ReactNode]; return <div key={l} className="flex justify-between gap-3 py-2.5"><span className="text-app-muted">{l}</span><span className="font-semibold text-right">{v}</span></div>; })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  );
}
