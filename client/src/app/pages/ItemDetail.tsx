import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowDownToLine, ArrowUpFromLine, Camera, Pencil } from "lucide-react";
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

  return (
    <div className="absolute inset-0 flex flex-col bg-app font-app">
      {/* Hero */}
      <div className="relative shrink-0 overflow-hidden" style={{ background: `linear-gradient(160deg, ${item.color}33, ${item.color}80)` }}>
        <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] h-[calc(env(safe-area-inset-top,0px)+52px)] flex items-center justify-between">
          <BackButton />
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => go("set")} className="w-10 h-10 rounded-full bg-white/70 backdrop-blur grid place-items-center text-ink" aria-label="Fijar stock"><Pencil size={18} /></motion.button>
        </div>
        <div className="flex flex-col items-center pb-6 pt-1">
          <Thumb item={item} size={128} layoutId={`thumb-${item.key}`} />
          <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, ...softSpring }} className="mt-4 text-[26px] font-bold tracking-tight text-ink text-center px-6">{item.name}</motion.h1>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }} className="text-[14px] text-ink/60 font-medium">{item.type === "ingredient" ? "Insumo" : "Producto"} · {item.subtitle}</motion.div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-28">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, ...softSpring }}>
          <Card className="-mt-4 p-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-app-muted">Stock actual</div>
                <div className="text-[40px] leading-none font-bold tracking-tight mt-1">{num(item.stock, 2)} <span className="text-[16px] font-semibold text-app-muted">{item.unit}</span></div>
              </div>
              <div className="text-right"><StatusTag status={st} /><div className="text-[13px] text-app-muted mt-0.5">mínimo {num(item.min_stock, 2)} {item.unit}</div></div>
            </div>
            <div className="mt-3"><StockBar stock={item.stock} min={item.min_stock} /></div>
          </Card>
        </motion.div>

        <motion.div variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-3 gap-3 mt-3">
          {[["Costo / u", money(item.cost)], ["Valor", money(item.stock * item.cost)], [item.type === "ingredient" ? "Usado en" : "Tipo", item.type === "ingredient" ? `${item.usedIn ?? 0} prod.` : "Venta"]].map(([l, v]) => (
            <motion.div key={l} variants={rowVariants} className="bg-white rounded-[18px] shadow-app p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{l}</div>
              <div className="text-[17px] font-bold mt-0.5 truncate">{v}</div>
            </motion.div>
          ))}
        </motion.div>

        <SectionTitle right={<button className="text-[13px] font-semibold text-mint-2" onClick={() => nav("/app/historial")}>Ver todo</button>}>Movimientos recientes</SectionTitle>
        {recent.length === 0 ? <div className="text-[14px] text-app-muted px-1">Sin movimientos todavía.</div> : (
          <motion.div variants={listVariants} initial="hidden" animate="show" className="bg-white rounded-[22px] shadow-app divide-y divide-black/5">
            {recent.map((m) => (
              <motion.div key={m.id} variants={rowVariants} className="flex items-center gap-3 p-3">
                <div className={`w-10 h-10 rounded-xl grid place-items-center ${m.qty < 0 ? "bg-berry-soft text-berry" : "bg-mint-soft text-mint-2"}`}>{m.qty < 0 ? <ArrowUpFromLine size={18} /> : <ArrowDownToLine size={18} />}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold capitalize truncate">{m.reason}{m.order_number ? ` · pedido #${m.order_number}` : ""}</div>
                  <div className="text-[12px] text-app-muted truncate">{dateTime(m.created_at)}{m.user_name ? ` · ${m.user_name}` : ""}{m.notes ? ` · ${m.notes}` : ""}</div>
                </div>
                <div className={`text-[15px] font-bold ${m.qty < 0 ? "text-berry" : "text-mint-2"}`}>{m.qty > 0 ? "+" : ""}{num(m.qty, 3)}</div>
                {m.photo && <Camera size={16} className="text-app-muted" />}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <motion.div initial={{ y: 80 }} animate={{ y: 0 }} transition={{ delay: 0.15, ...softSpring }} className="absolute left-0 right-0 bottom-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+14px)] pt-3 bg-gradient-to-t from-app via-app/95 to-transparent">
        <div className="grid grid-cols-2 gap-3">
          <BigButton variant="primary" onClick={() => go("in")}><ArrowDownToLine size={20} /> Entrada</BigButton>
          <BigButton variant="dark" onClick={() => go("out")}><ArrowUpFromLine size={20} /> Salida</BigButton>
        </div>
      </motion.div>
    </div>
  );
}
