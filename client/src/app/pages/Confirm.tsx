import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Camera, Check, Clock, UserRound, Loader2 } from "lucide-react";
import { adjustStock } from "@/lib/actions";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";
import { useFlow, useInventory } from "../store";
import { Screen, Card, Thumb, BigButton, listVariants, rowVariants } from "../ui";
import { num } from "@/lib/format";

export default function Confirm() {
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const flow = useFlow();
  const { load, loadMovements } = useInventory();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!flow.item) nav("/app", { replace: true }); }, [flow.item, nav]);
  const item = flow.item;
  if (!item) return <div className="absolute inset-0 bg-app" />;

  const qty = Number(flow.qty || 0);
  const delta = flow.mode === "set" ? qty - item.stock : flow.mode === "out" ? -qty : qty;
  const after = item.stock + delta;
  const label = { in: "Entrada", out: "Salida", set: "Fijar stock" }[flow.mode];

  const confirm = async () => {
    setBusy(true);
    try {
      const { queued } = await adjustStock({ item_type: item.type, item: { id: item.id, client_id: item.client_id, name: item.name, unit: item.unit, stock: item.stock }, qty: flow.mode === "set" ? qty : flow.mode === "out" ? -qty : qty, set: flow.mode === "set", reason: flow.reason, notes: flow.notes, photo: flow.photo });
      flow.set({ result: { before: item.stock, after, delta, at: new Date().toISOString(), queued } });
      load(); loadMovements();
      nav("/app/ajustar/listo", { replace: true });
    } catch (e) { toast.error("No se pudo guardar", (e as Error).message); setBusy(false); }
  };

  return (
    <Screen back title="Confirmar ajuste" subtitle="Revisa los datos antes de guardar" footer={
      <BigButton onClick={confirm} disabled={busy}>{busy ? <><Loader2 className="animate-spin" size={20} /> Guardando…</> : <><Check size={22} strokeWidth={2.6} /> Confirmar {label.toLowerCase()}</>}</BigButton>
    }>
      <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-3">
        <motion.div variants={rowVariants}>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Thumb item={item} size={56} layoutId={`thumb-${item.key}`} />
              <div className="min-w-0 flex-1"><div className="text-[16px] font-semibold truncate">{item.name}</div><div className="text-[13px] text-app-muted">{item.subtitle}</div></div>
              <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full ${flow.mode === "out" ? "bg-ink text-white" : flow.mode === "set" ? "bg-sky-soft text-[#0f6f95]" : "bg-mint-soft text-mint-2"}`}>{label}</span>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="text-center"><div className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">Antes</div><div className="text-[26px] font-bold tracking-tight">{num(item.stock, 2)}</div></div>
              <motion.div initial={{ x: -6, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }} className={`w-12 h-12 rounded-full grid place-items-center font-bold text-[13px] ${delta < 0 ? "bg-berry-soft text-berry" : "bg-mint-soft text-mint-2"}`}>{delta > 0 ? "+" : ""}{num(delta, 2)}</motion.div>
              <div className="text-center"><div className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">Después</div><div className="text-[26px] font-bold tracking-tight">{num(after, 2)}</div></div>
            </div>
            <div className="text-center text-[12px] text-app-muted mt-1">{item.unit}</div>
          </Card>
        </motion.div>

        <motion.div variants={rowVariants}>
          <Card className="overflow-hidden">
            {flow.photo ? (
              <div className="relative"><img src={flow.photo} alt="Comprobante" className="w-full max-h-72 object-cover" /><span className="absolute top-3 left-3 pill bg-white/90 text-ink"><Camera size={12} /> Comprobante</span></div>
            ) : (
              <div className="p-4 flex items-center gap-3 text-app-muted"><Camera size={20} /><span className="text-[14px]">Sin foto de comprobante</span></div>
            )}
          </Card>
        </motion.div>

        <motion.div variants={rowVariants}>
          <Card className="divide-y divide-black/5">
            <Row label="Motivo"><span className="capitalize">{flow.reason}</span></Row>
            {flow.notes && <Row label="Detalle">{flow.notes}</Row>}
            <Row label="Responsable"><span className="flex items-center gap-1.5"><UserRound size={15} className="text-app-muted" />{user?.name}</span></Row>
            <Row label="Fecha y hora"><span className="flex items-center gap-1.5 tabular-nums"><Clock size={15} className="text-app-muted" />{now.toLocaleDateString("es", { day: "2-digit", month: "short" })} · {now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></Row>
          </Card>
        </motion.div>
        <motion.div variants={rowVariants} className="text-center text-[12px] text-app-muted pt-1 pb-4">Al confirmar, el movimiento queda registrado y visible para el administrador.</motion.div>
      </motion.div>
    </Screen>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]"><span className="text-app-muted">{label}</span><span className="font-semibold text-right">{children}</span></div>;
}
