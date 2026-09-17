import { useEffect, useRef, useState } from "react";
import { PandaMark, Wordmark } from "@/components/Logo";
import { useSocket } from "@/lib/socket";
import type { PublicOrder } from "@/lib/types";

function chime() {
  try {
    const ctx = new AudioContext(); const t = ctx.currentTime;
    [[659, 0], [784, 0.15], [1047, 0.3]].forEach(([f, d]) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = f; g.gain.value = 0.1; o.connect(g); g.connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.25); });
  } catch { /* no audio */ }
}

export default function Pantalla() {
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [clock, setClock] = useState(new Date());
  const readyRef = useRef<Set<string>>(new Set());

  const initRef = useRef(false);
  const load = () => fetch("/api/orders/board").then((r) => r.json()).then((list: PublicOrder[]) => {
    const nowReady = list.filter((o) => o.status === "ready").map((o) => o.code);
    const fresh = nowReady.filter((c) => !readyRef.current.has(c));
    if (initRef.current && fresh.length) { chime(); setFlash(fresh[0]); setTimeout(() => setFlash(null), 4000); }
    readyRef.current = new Set(nowReady); initRef.current = true;
    setOrders(list);
  }).catch(() => {});

  useEffect(() => { load(); const t = setInterval(load, 15000); const c = setInterval(() => setClock(new Date()), 1000); return () => { clearInterval(t); clearInterval(c); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useSocket({ "order:created": () => load(), "order:updated": () => load() });

  const preparing = orders.filter((o) => o.status === "pending" || o.status === "preparing").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ready = orders.filter((o) => o.status === "ready").sort((a, b) => (b.ready_at || "").localeCompare(a.ready_at || ""));

  const Tile = ({ o, big }: { o: PublicOrder; big?: boolean }) => (
    <div className={`rounded-3xl p-5 flex flex-col items-center justify-center text-center anim-pop ${big ? "bg-mint text-white shadow-[0_20px_50px_-20px_rgba(79,189,145,0.8)]" : "bg-paper text-ink shadow-soft"} ${flash === o.code ? "anim-ring" : ""}`}>
      <div className={`font-black tracking-tight leading-none ${big ? "text-6xl md:text-7xl" : "text-4xl md:text-5xl"}`}>#{o.daily_number}</div>
      {o.customer_name && <div className={`mt-2 font-extrabold truncate max-w-full ${big ? "text-xl text-white/90" : "text-base text-ink-3"}`}>{o.customer_name}</div>}
      {!big && <div className="mt-1 text-xs font-bold text-muted">{o.status === "preparing" ? "En preparación" : "En cola"}</div>}
    </div>
  );

  return (
    <div className="min-h-full bg-cream flex flex-col select-none">
      <header className="flex items-center justify-between px-8 py-5 bg-ink text-white">
        <div className="flex items-center gap-4"><PandaMark size={52} /><Wordmark height={40} color="#FFFDF8" face="#232323" /></div>
        <div className="text-right"><div className="text-3xl font-black tabular-nums">{clock.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</div><div className="text-xs font-bold text-white/60 uppercase tracking-widest">{clock.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}</div></div>
      </header>
      <main className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_1.3fr] gap-6 p-6 md:p-8">
        <section className="flex flex-col">
          <div className="flex items-center gap-3 mb-4"><span className="w-3 h-3 rounded-full bg-sky" /><h2 className="text-2xl font-black">Preparando</h2><span className="ml-auto text-lg font-black text-muted">{preparing.length}</span></div>
          {preparing.length === 0 ? <div className="flex-1 grid place-items-center text-muted font-bold text-lg rounded-3xl border-2 border-dashed border-line">Sin pedidos en preparación</div> : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 content-start">{preparing.map((o) => <Tile key={o.code} o={o} />)}</div>
          )}
        </section>
        <section className="flex flex-col">
          <div className="flex items-center gap-3 mb-4"><span className="w-3 h-3 rounded-full bg-mint anim-ring" /><h2 className="text-2xl font-black">¡Listo para retirar!</h2><span className="ml-auto text-lg font-black text-muted">{ready.length}</span></div>
          {ready.length === 0 ? (
            <div className="flex-1 grid place-items-center rounded-3xl bg-paper shadow-soft"><div className="text-center"><PandaMark size={140} className="mx-auto anim-wiggle" /><div className="mt-4 text-xl font-black text-ink-3">Tu pedido aparecerá aquí</div><div className="text-muted font-bold">Café · Heladería · Bakery</div></div></div>
          ) : (
            <div className="grid grid-cols-2 gap-4 content-start">{ready.map((o) => <Tile key={o.code} o={o} big />)}</div>
          )}
        </section>
      </main>
      <footer className="px-8 py-3 text-center text-sm font-bold text-muted">Cuando tu número aparezca en verde, acércate al mostrador 🐼</footer>
    </div>
  );
}
