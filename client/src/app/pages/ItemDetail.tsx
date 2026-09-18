import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowDownToLine, ArrowUpFromLine, Camera, ClipboardList, Coins, Layers, Pencil, Tag, Wallet } from "lucide-react";
import { useInventory, useFlow, stockStatus } from "../store";
import { BackButton, Card, Thumb, StockBar, StatusTag, SectionTitle, BigButton, listVariants, rowVariants, softSpring } from "../ui";
import { money, num, dateTime } from "@/lib/format";

export default function ItemDetail() {
  const { key = "" } = useParams();
  const nav = useNavigate();
  const { items, movements, byKey } = useInventory();
  const item = byKey(key);
  const start = useFlow((s) => s.start);

  useEffect(() => { if (items && !item) nav("/app", { replace: true }); }, [items, item, nav]);
  if (!item) return <div className="absolute inset-0 bg-app" />;

  const st = stockStatus(item);
  const recent = movements.filter((m) => m.item_type === item.type && m.item_id === item.id).slice(0, 8);
  const go = (mode: "in" | "out" | "set") => { start(item, mode); nav(`/app/item/${item.key}/ajustar`); };
  const isIng = item.type === "ingredient";
  const stockHint = st === "out"
    ? "Sin existencias · registra una entrada"
    : st === "low"
      ? `Faltan ${num(item.min_stock - item.stock, 2)} ${item.unit} para llegar al mínimo`
      : item.min_stock > 0 ? `${num(item.stock - item.min_stock, 2)} ${item.unit} por encima del mínimo` : "Sin mínimo definido";

  const stats: { label: string; value: string; icon: typeof Coins; tint: string; bg: string }[] = [
    { label: "Costo / u", value: money(item.cost), icon: Coins, tint: "text-peach-2", bg: "bg-peach-soft" },
    { label: "Valor", value: money(item.stock * item.cost), icon: Wallet, tint: "text-mint-2", bg: "bg-mint-soft" },
    isIng
      ? { label: "Usado en", value: `${item.usedIn ?? 0} prod.`, icon: Layers, tint: "text-lilac", bg: "bg-lilac-soft" }
      : { label: "Tipo", value: "Venta", icon: Tag, tint: "text-sky", bg: "bg-sky-soft" },
  ];

  return (
    <div className="absolute inset-0 flex flex-col bg-app font-app">
      {/* Hero */}
      <div className="relative shrink-0 overflow-hidden" style={{ background: `linear-gradient(165deg, ${item.color}2e 0%, ${item.color}66 55%, ${item.color}99 100%)` }}>
        <div className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full bg-white/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-10 w-64 h-64 rounded-full blur-3xl" style={{ background: `${item.color}aa` }} />
        {!item.image && (
          <div className="pointer-events-none absolute -right-6 -bottom-8 select-none opacity-[0.14] rotate-[-14deg]" style={{ fontSize: 190, lineHeight: 1 }} aria-hidden>{item.emoji}</div>
        )}

        <div className="relative px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] h-[calc(env(safe-area-inset-top,0px)+52px)] flex items-center justify-between">
          <BackButton />
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => go("set")} className="h-10 pl-3 pr-3.5 rounded-full bg-white/75 backdrop-blur shadow-app flex items-center gap-1.5 text-ink text-[13px] font-semibold" aria-label="Fijar stock">
            <Pencil size={15} /> Fijar
          </motion.button>
        </div>

        <div className="relative flex flex-col items-center pb-12 pt-2">
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={softSpring} className="rounded-[38px] p-1.5 bg-white/55 backdrop-blur shadow-lift ring-1 ring-white/70">
            <Thumb item={item} size={124} layoutId={`thumb-${item.key}`} />
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, ...softSpring }} className="mt-4 text-[27px] leading-tight font-bold tracking-[-0.02em] text-ink text-center px-6">{item.name}</motion.h1>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, ...softSpring }} className="mt-2.5 flex items-center gap-1.5">
            <span className="h-7 px-3 rounded-full bg-ink/80 text-white text-[12px] font-semibold flex items-center">{isIng ? "Insumo" : "Producto"}</span>
            <span className="h-7 px-3 rounded-full bg-white/70 backdrop-blur text-ink text-[12px] font-semibold flex items-center max-w-[52vw] truncate">{item.subtitle}</span>
          </motion.div>
        </div>
      </div>

      {/* Body sheet, curved over the hero */}
      <div className="relative z-10 -mt-7 flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-t-[30px] bg-app px-4 pt-4 pb-32 shadow-[0_-8px_30px_-16px_rgba(0,0,0,0.25)]">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, ...softSpring }}>
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-app-muted">Stock actual</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[46px] leading-none font-bold tracking-[-0.03em] tabular-nums text-ink">{num(item.stock, 2)}</span>
                  <span className="text-[17px] font-semibold text-app-muted">{item.unit}</span>
                </div>
              </div>
              <div className="text-right shrink-0 pt-0.5">
                <StatusTag status={st} pill />
                <div className="text-[12px] text-app-muted mt-1.5">mínimo <span className="font-semibold text-ink-3">{num(item.min_stock, 2)} {item.unit}</span></div>
              </div>
            </div>
            <div className="mt-4"><StockBar stock={item.stock} min={item.min_stock} marker height={10} /></div>
            <div className={`mt-2.5 text-[13px] font-medium ${st === "out" ? "text-berry" : st === "low" ? "text-[#b45309]" : "text-app-muted"}`}>{stockHint}</div>
          </Card>
        </motion.div>

        <motion.div variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-3 gap-2.5 mt-3">
          {stats.map(({ label, value, icon: Icon, tint, bg }) => (
            <motion.div key={label} variants={rowVariants} className="bg-white rounded-[20px] shadow-app p-3 min-w-0">
              <div className={`w-8 h-8 rounded-full grid place-items-center ${bg} ${tint}`}><Icon size={15} strokeWidth={2.25} /></div>
              <div className="text-[11px] font-semibold text-app-muted mt-2.5 truncate">{label}</div>
              <div className="text-[17px] font-bold tracking-tight tabular-nums truncate">{value}</div>
            </motion.div>
          ))}
        </motion.div>

        <SectionTitle right={recent.length > 0 ? <button className="h-7 px-2.5 rounded-full bg-white shadow-app text-[12px] font-semibold text-mint-2" onClick={() => nav("/app/historial")}>Ver todo</button> : undefined}>Movimientos recientes</SectionTitle>
        {recent.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, ...softSpring }}
            className="rounded-[22px] border-2 border-dashed border-black/[0.08] px-5 py-7 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-white shadow-app grid place-items-center text-app-muted"><ClipboardList size={22} /></div>
            <div className="mt-3 text-[15px] font-bold text-ink">Sin movimientos todavía</div>
            <div className="mt-1 text-[13px] text-app-muted leading-snug">Registra una entrada o salida y aparecerá aquí con fecha, usuario y comprobante.</div>
          </motion.div>
        ) : (
          <motion.div variants={listVariants} initial="hidden" animate="show" className="bg-white rounded-[22px] shadow-app divide-y divide-black/[0.05] overflow-hidden">
            {recent.map((m) => (
              <motion.div key={m.id} variants={rowVariants} className="flex items-center gap-3 px-3.5 py-3">
                <div className={`w-10 h-10 rounded-[14px] grid place-items-center shrink-0 ${m.qty < 0 ? "bg-berry-soft text-berry" : "bg-mint-soft text-mint-2"}`}>{m.qty < 0 ? <ArrowUpFromLine size={18} strokeWidth={2.25} /> : <ArrowDownToLine size={18} strokeWidth={2.25} />}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold capitalize truncate">{m.reason}{m.order_number ? ` · pedido #${m.order_number}` : ""}</div>
                  <div className="text-[12px] text-app-muted truncate">{dateTime(m.created_at)}{m.user_name ? ` · ${m.user_name}` : ""}{m.notes ? ` · ${m.notes}` : ""}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.photo && <Camera size={15} className="text-app-muted" />}
                  <div className={`text-[15px] font-bold tabular-nums ${m.qty < 0 ? "text-berry" : "text-mint-2"}`}>{m.qty > 0 ? "+" : ""}{num(m.qty, 3)}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <motion.div initial={{ y: 80 }} animate={{ y: 0 }} transition={{ delay: 0.15, ...softSpring }} className="absolute z-20 left-0 right-0 bottom-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+14px)] pt-6 bg-gradient-to-t from-app via-app/95 to-transparent">
        <div className="grid grid-cols-2 gap-3">
          <BigButton variant="primary" onClick={() => go("in")}><ArrowDownToLine size={20} /> Entrada</BigButton>
          <BigButton variant="dark" onClick={() => go("out")}><ArrowUpFromLine size={20} /> Salida</BigButton>
        </div>
      </motion.div>
    </div>
  );
}
