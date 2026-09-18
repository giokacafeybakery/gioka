import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { House, RotateCcw, PackageSearch } from "lucide-react";
import { useFlow } from "../store";
import { BigButton, Card, Thumb } from "../ui";
import { num } from "@/lib/format";

export default function Done() {
  const nav = useNavigate();
  const flow = useFlow();
  const { item, result } = flow;
  useEffect(() => { if (!item || !result) nav("/app", { replace: true }); }, [item, result, nav]);
  if (!item || !result) return <div className="absolute inset-0 bg-app" />;

  const label = result.delta < 0 ? "Salida registrada" : flow.mode === "set" ? "Stock actualizado" : "Entrada registrada";

  return (
    <div className="absolute inset-0 bg-app font-app flex flex-col overflow-hidden">
      {/* Confetti-ish soft blobs */}
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }} className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-mint/20 blur-3xl" />
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.25 }} className="absolute top-1/3 -left-24 w-64 h-64 rounded-full bg-peach/20 blur-3xl" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center relative">
        <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.05 }}
          className="relative w-32 h-32 rounded-full bg-mint grid place-items-center shadow-[0_24px_50px_-16px_rgba(79,189,145,0.9)]">
          <motion.span className="absolute inset-0 rounded-full bg-mint" initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 1.1, delay: 0.3, ease: "easeOut" }} />
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="relative">
            <motion.path d="M16 33.5L27 44L48 22" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 0.35, duration: 0.45, ease: [0.65, 0, 0.35, 1] }} />
          </svg>
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-7 text-[30px] font-bold tracking-tight">¡Listo!</motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.58 }} className="text-[16px] text-app-muted mt-1">{label} · {new Date(result.at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</motion.p>
        {result.queued && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full bg-butter-soft text-[#9a5b00]">Guardado en el teléfono · se enviará al volver la conexión</motion.p>}

        <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.7, type: "spring", stiffness: 300, damping: 26 }} className="w-full mt-7">
          <Card className="p-4 flex items-center gap-3 text-left">
            <Thumb item={item} size={56} layoutId={`thumb-${item.key}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-semibold truncate">{item.name}</div>
              <div className="text-[13px] text-app-muted">{num(result.before, 2)} → <b className="text-ink">{num(result.after, 2)} {item.unit}</b></div>
            </div>
            <div className={`text-[20px] font-bold ${result.delta < 0 ? "text-berry" : "text-mint-2"}`}>{result.delta > 0 ? "+" : ""}{num(result.delta, 2)}</div>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ y: 120 }} animate={{ y: 0 }} transition={{ delay: 0.85, type: "spring", stiffness: 320, damping: 30 }} className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] space-y-2">
        <BigButton variant="dark" onClick={() => { flow.reset(); nav("/app", { replace: true }); }}><House size={20} /> Volver al inventario</BigButton>
        <div className="grid grid-cols-2 gap-2">
          <BigButton variant="soft" onClick={() => { const k = item.key; flow.start(item, flow.mode); nav(`/app/item/${k}/ajustar`, { replace: true }); }}><RotateCcw size={18} /> Otro ajuste</BigButton>
          <BigButton variant="soft" onClick={() => { const k = item.key; flow.reset(); nav(`/app/item/${k}`, { replace: true }); }}><PackageSearch size={18} /> Ver ítem</BigButton>
        </div>
      </motion.div>
    </div>
  );
}
