import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowDownToLine, ArrowUpFromLine, Camera } from "lucide-react";
import { useInventory, type Movement } from "../store";
import { Screen, Chip, Sheet, listVariants, rowVariants, EmptyState } from "../ui";
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

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.item_name} subtitle={open ? dateTime(open.created_at) : ""}>
        {open && (
          <>
            {open.photo && <img src={open.photo} alt="Comprobante" className="w-full rounded-2xl object-contain max-h-[42dvh] bg-black/5" />}
            <div className="mt-3 divide-y divide-black/5 text-[15px]">
              {([["Movimiento", <span className={`font-bold ${open.qty < 0 ? "text-berry" : "text-mint-2"}`}>{open.qty > 0 ? "+" : ""}{num(open.qty, 3)} {open.unit}</span>], ["Motivo", <span className="capitalize">{open.reason}</span>], open.notes ? ["Detalle", open.notes] : null, ["Usuario", open.user_name || "—"], open.order_number ? ["Pedido", `#${open.order_number}`] : null] as ([string, React.ReactNode] | null)[])
                .filter((r): r is [string, React.ReactNode] => !!r).map(([l, v]) => <div key={l} className="flex justify-between gap-3 py-2.5"><span className="text-app-muted">{l}</span><span className="font-semibold text-right">{v}</span></div>)}
            </div>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
