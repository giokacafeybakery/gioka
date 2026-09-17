import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownToLine, ArrowUpFromLine, Camera, Pencil, X, Minus, Plus, ArrowRight } from "lucide-react";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";
import { useInventory, useFlow, REASONS, type Mode } from "../store";
import { Screen, Card, Thumb, BigButton, Chip, Sheet, Keypad, softSpring } from "../ui";
import { num } from "@/lib/format";

const MODES: { k: Mode; label: string; icon: React.ReactNode; color: string }[] = [
  { k: "in", label: "Entrada", icon: <ArrowDownToLine size={20} />, color: "bg-mint text-white" },
  { k: "out", label: "Salida", icon: <ArrowUpFromLine size={20} />, color: "bg-ink text-white" },
  { k: "set", label: "Fijar", icon: <Pencil size={18} />, color: "bg-sky text-white" },
];

export default function Adjust() {
  const { key = "" } = useParams();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const { items, byKey } = useInventory();
  const flow = useFlow();
  const item = byKey(key);
  const photoRef = useRef<HTMLInputElement>(null);
  const photoRequired = user?.role === "inventario";
  const [pad, setPad] = useState(false);
  // Open the keypad right after the screen slides in (quantity is the first thing to fill)
  useEffect(() => { const t = setTimeout(() => setPad(true), 420); return () => clearTimeout(t); }, []);

  // Arriving directly (deep link / center button) → start a fresh draft for this item
  useEffect(() => { if (item && flow.item?.key !== item.key) flow.start(item); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [item?.key]);
  useEffect(() => { if (items && !item) nav("/app", { replace: true }); }, [items, item, nav]);
  if (!item) return <div className="absolute inset-0 bg-app" />;

  const qty = Number(flow.qty || 0);
  const after = flow.mode === "set" ? qty : item.stock + (flow.mode === "out" ? -qty : qty);
  const invalid = flow.qty === "" || !Number.isFinite(qty) || qty < 0 || (flow.mode !== "set" && qty === 0) || (flow.mode === "out" && qty > item.stock);
  const step = (d: number) => flow.set({ qty: String(Math.max(0, +(qty + d).toFixed(3))) });

  const pick = (f: File | undefined) => {
    if (!f) return;
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 1400; const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      flow.set({ photo: c.toDataURL("image/jpeg", 0.82) }); URL.revokeObjectURL(url);
    };
    img.onerror = () => { toast.error("No se pudo leer la imagen"); URL.revokeObjectURL(url); };
    img.src = url;
  };

  const next = () => {
    if (invalid) return;
    if (photoRequired && !flow.photo) return toast.warning("Adjunta la foto del comprobante");
    nav("/app/ajustar/confirmar");
  };

  return (
    <Screen back title="Ajustar stock" footer={
      <BigButton onClick={next} disabled={invalid || (photoRequired && !flow.photo)}>Revisar ajuste <ArrowRight size={20} /></BigButton>
    }>
      <Card className="p-3 flex items-center gap-3">
        <Thumb item={item} size={56} layoutId={`thumb-${item.key}`} />
        <div className="min-w-0"><div className="text-[16px] font-semibold truncate">{item.name}</div><div className="text-[13px] text-app-muted">Stock actual: <b className="text-ink">{num(item.stock, 2)} {item.unit}</b></div></div>
      </Card>

      {/* Mode */}
      <div className="grid grid-cols-3 gap-2 mt-4 p-1 rounded-[18px] bg-black/5">
        {MODES.map((m) => (
          <button key={m.k} onClick={() => flow.set({ mode: m.k, reason: REASONS[m.k][0] })} className="relative h-12 rounded-[14px] text-[14px] font-semibold flex items-center justify-center gap-1.5">
            {flow.mode === m.k && <motion.span layoutId="mode-pill" className={`absolute inset-0 rounded-[14px] ${m.color}`} transition={softSpring} />}
            <span className={`relative flex items-center gap-1.5 ${flow.mode === m.k ? "" : "text-ink-3"}`}>{m.icon}{m.label}</span>
          </button>
        ))}
      </div>

      {/* Quantity */}
      <Card className="mt-4 p-4">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">{flow.mode === "set" ? "Nuevo stock" : "Cantidad"} ({item.unit})</div>
        <div className="flex items-center gap-3 mt-2">
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => step(-1)} className="w-12 h-12 rounded-full bg-black/5 grid place-items-center shrink-0"><Minus size={20} /></motion.button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setPad(true)} className="flex-1 min-w-0 h-16 rounded-2xl bg-black/[0.04] text-center text-[40px] font-bold tracking-tight tabular-nums">
            {flow.qty || <span className="text-black/20">0</span>}
          </motion.button>
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => step(1)} className="w-12 h-12 rounded-full bg-ink text-white grid place-items-center shrink-0"><Plus size={20} /></motion.button>
        </div>
        <div className="flex gap-2 justify-center mt-3">{[1, 5, 10, 25].map((n) => <Chip key={n} onClick={() => step(n)}>+{n}</Chip>)}</div>
        <AnimatePresence>
          {flow.qty !== "" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className={`mt-3 pt-3 border-t border-black/5 text-[14px] ${invalid ? "text-berry" : "text-app-muted"}`}>
                {flow.mode === "out" && qty > item.stock ? "No puedes sacar más de lo que hay en stock." : <>Stock resultante: <b className="text-ink">{num(after, 2)} {item.unit}</b></>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Photo */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between px-1 mb-2"><span className="text-[15px] font-bold">Comprobante</span><span className={`text-[12px] font-semibold ${photoRequired ? "text-berry" : "text-app-muted"}`}>{photoRequired ? "Obligatorio" : "Opcional"}</span></div>
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <AnimatePresence mode="wait">
          {flow.photo ? (
            <motion.div key="photo" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="relative rounded-[22px] overflow-hidden shadow-app bg-white">
              <img src={flow.photo} alt="Comprobante" className="w-full max-h-64 object-cover" />
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => flow.set({ photo: null })} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white grid place-items-center backdrop-blur" aria-label="Quitar"><X size={16} /></motion.button>
              <button onClick={() => photoRef.current?.click()} className="absolute bottom-3 right-3 h-9 px-3 rounded-full bg-white/90 text-ink text-[13px] font-semibold flex items-center gap-1.5"><Camera size={14} /> Cambiar</button>
            </motion.div>
          ) : (
            <motion.button key="pick" whileTap={{ scale: 0.98 }} onClick={() => photoRef.current?.click()}
              className={`w-full h-32 rounded-[22px] border-2 border-dashed flex flex-col items-center justify-center gap-1.5 font-semibold text-[15px] ${photoRequired ? "border-mint/60 bg-mint-soft/50 text-mint-2" : "border-black/10 bg-white text-app-muted"}`}>
              <span className="w-12 h-12 rounded-full bg-white shadow-app grid place-items-center"><Camera size={22} /></span>
              Tomar foto del comprobante
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Reason + notes */}
      <div className="mt-4">
        <div className="text-[15px] font-bold px-1 mb-2">Motivo</div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">{REASONS[flow.mode].map((r) => <Chip key={r} active={flow.reason === r} onClick={() => flow.set({ reason: r })}><span className="capitalize">{r}</span></Chip>)}</div>
        <input className="mt-3 w-full h-12 rounded-2xl bg-white shadow-app px-4 text-[15px] outline-none placeholder:text-app-muted/80" placeholder="Detalle opcional: factura, proveedor, lote…" value={flow.notes} onChange={(e) => flow.set({ notes: e.target.value })} maxLength={500} />
      </div>
      <div className="h-6" />

      <Sheet open={pad} onClose={() => setPad(false)} title={flow.mode === "set" ? "Nuevo stock" : flow.mode === "out" ? "Cantidad que sale" : "Cantidad que entra"} subtitle={`${item.name} · stock actual ${num(item.stock, 2)} ${item.unit}`}>
        <Keypad value={flow.qty} onChange={(v) => flow.set({ qty: v })} onDone={() => setPad(false)} unit={item.unit}
          hint={flow.qty === "" ? "Ingresa la cantidad" : flow.mode === "out" && qty > item.stock ? <span className="text-berry">No puedes sacar más de lo que hay en stock</span> : <>Stock resultante: <b className="text-ink">{num(after, 2)} {item.unit}</b></>} />
      </Sheet>
    </Screen>
  );
}
