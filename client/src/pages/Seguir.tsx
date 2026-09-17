import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, ChefHat, Clock, PartyPopper, Search, XCircle } from "lucide-react";
import { PandaMark, Wordmark } from "@/components/Logo";
import { useSocket } from "@/lib/socket";
import { money, time, TYPE } from "@/lib/format";
import type { PublicOrder, OrderStatus } from "@/lib/types";
import { useSettings } from "@/store/settings";

const STEPS: { status: OrderStatus; label: string; hint: string; icon: React.ReactNode }[] = [
  { status: "pending", label: "Recibido", hint: "Tu pedido está en cola", icon: <Clock size={20} /> },
  { status: "preparing", label: "Preparando", hint: "Nuestro equipo lo está preparando", icon: <ChefHat size={20} /> },
  { status: "ready", label: "¡Listo!", hint: "Acércate al mostrador", icon: <PartyPopper size={20} /> },
  { status: "delivered", label: "Entregado", hint: "¡Buen provecho!", icon: <Check size={20} /> },
];

export default function Seguir() {
  const { code } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const load = useSettings((s) => s.load);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const fetchOrder = () => code && fetch(`/api/orders/track/${code}`).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || "No encontrado"); return r.json(); }).then((o) => { setOrder(o); setError(""); }).catch((e) => setError(e.message));
  useEffect(() => { fetchOrder(); const t = setInterval(fetchOrder, 20000); return () => clearInterval(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [code]);
  useSocket({ "order:updated": (o: { code: string }) => o.code === code && fetchOrder() }, [code]);

  const idx = order ? STEPS.findIndex((s) => s.status === order.status) : -1;

  return (
    <div className="min-h-full bg-cream flex flex-col items-center px-4 py-8">
      <div className="flex flex-col items-center mb-6"><PandaMark size={72} className={order?.status === "ready" ? "anim-wiggle" : ""} /><Wordmark height={30} className="mt-1" /></div>

      {!code || error ? (
        <div className="card p-6 w-full max-w-sm text-center anim-fade-up">
          {error && <div className="text-berry font-bold mb-3 flex items-center justify-center gap-2"><XCircle size={18} /> {error}</div>}
          <h1 className="text-xl font-black">Sigue tu pedido</h1>
          <p className="text-sm font-semibold text-muted mt-1">Ingresa el código que aparece en tu ticket</p>
          <div className="flex gap-2 mt-4">
            <input className="input uppercase tracking-widest font-black text-center" placeholder="G-ABC12" value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && input && nav(`/seguir/${input}`)} />
            <button className="btn-primary px-4" onClick={() => input && nav(`/seguir/${input}`)}><Search size={18} /></button>
          </div>
        </div>
      ) : !order ? (
        <div className="text-muted font-bold">Cargando…</div>
      ) : (
        <div className="w-full max-w-sm space-y-4 anim-fade-up">
          <div className={`rounded-3xl p-6 text-center ${order.status === "ready" ? "bg-mint text-white anim-ring" : order.status === "cancelled" ? "bg-berry-soft text-berry" : "bg-ink text-white"}`}>
            <div className="text-xs font-extrabold uppercase tracking-widest opacity-70">Pedido</div>
            <div className="text-6xl font-black tracking-tight leading-none mt-1">#{order.daily_number}</div>
            <div className="mt-2 font-extrabold text-lg">{order.status === "cancelled" ? "Pedido cancelado" : STEPS[idx]?.label}</div>
            <div className="text-sm opacity-80 font-semibold">{order.status === "cancelled" ? "Consulta en el mostrador" : STEPS[idx]?.hint}</div>
          </div>

          {order.status !== "cancelled" && (
            <div className="card p-5">
              <ol className="relative">
                {STEPS.map((s, i) => { const done = i <= idx; const cur = i === idx; return (
                  <li key={s.status} className="flex gap-3 pb-5 last:pb-0">
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${done ? (cur && s.status === "ready" ? "bg-mint text-white anim-ring" : "bg-ink text-white") : "bg-cream text-muted"}`}>{done && !cur ? <Check size={18} /> : s.icon}</div>
                      {i < STEPS.length - 1 && <div className={`w-0.5 flex-1 mt-1 ${i < idx ? "bg-ink" : "bg-line"}`} />}
                    </div>
                    <div className="pt-2"><div className={`font-black ${done ? "" : "text-muted"}`}>{s.label}</div><div className="text-xs font-semibold text-muted">{s.hint}</div></div>
                  </li>); })}
              </ol>
            </div>
          )}

          <div className="card p-5">
            <div className="flex justify-between text-xs font-extrabold uppercase tracking-wider text-muted mb-3"><span>{TYPE[order.type].label}{order.customer_name && ` · ${order.customer_name}`}</span><span>{time(order.created_at)}</span></div>
            <ul className="divide-y divide-line">
              {order.items.map((it, i) => <li key={i} className="py-2 flex items-center gap-3 text-sm"><span className="text-xl">{it.emoji}</span><span className="font-bold flex-1">{it.name}</span><span className="font-black text-muted">×{it.qty}</span></li>)}
            </ul>
            <div className="mt-3 pt-3 border-t border-line flex justify-between items-baseline"><span className="font-bold text-muted text-sm">{order.paid ? "Pagado" : "Pago pendiente"}</span><span className="text-xl font-black">{money(order.total)}</span></div>
          </div>
          <div className="text-center text-xs font-bold text-muted">Código {order.code} · Esta página se actualiza sola</div>
        </div>
      )}
    </div>
  );
}
