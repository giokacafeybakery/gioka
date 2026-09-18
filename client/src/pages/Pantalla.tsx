import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PandaMark, Wordmark } from "@/components/Logo";
import { PandaListo, preloadPandaListo } from "@/components/PandaListo";
import { useSocket } from "@/lib/socket";
import type { PublicOrder } from "@/lib/types";

/*
 * Pantalla pública para TV (16:9, vista desde lejos).
 * - Tema oscuro para no deslumbrar; toda la escala en vh/vw para que se vea igual en cualquier TV.
 * - El último pedido listo se muestra gigante; los demás listos debajo; los que se preparan a la izquierda.
 * - Cuando un pedido pasa a "listo": sonido (sounds/pedido-listo.mp3) + takeover de pantalla completa durante unos segundos.
 */

const MAX_PREPARING = 12;
const MAX_READY = 7; // 1 destacado + 6
const TAKEOVER_MS = 5000;
const spring = { type: "spring", stiffness: 240, damping: 30, mass: 0.9 } as const;

// Timbre de "pedido listo": el mp3 en public/sounds (precargado una vez); si el navegador se niega a reproducirlo, cae al acorde sintetizado.
const readySound = typeof Audio !== "undefined" ? new Audio("/sounds/pedido-listo.mp3") : null;
if (readySound) { readySound.preload = "auto"; readySound.volume = 1; }

function fallbackChime() {
  try {
    const ctx = new AudioContext(); const t = ctx.currentTime;
    [[659, 0], [784, 0.16], [1047, 0.32], [1047, 0.7]].forEach(([f, d]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.45);
      o.connect(g); g.connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.5);
    });
  } catch { /* sin audio */ }
}

function chime() {
  if (!readySound) return fallbackChime();
  readySound.currentTime = 0;
  readySound.play().catch(fallbackChime);
}

const vh = (n: number) => Math.round((typeof window !== "undefined" ? window.innerHeight : 1080) * n / 100);
const displayName = (o: PublicOrder) => (o.customer_name || "").trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

export default function Pantalla() {
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [queue, setQueue] = useState<PublicOrder[]>([]); // pedidos recién listos pendientes de anunciar
  const [clock, setClock] = useState(new Date());
  const readyRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);

  const load = () => fetch("/api/orders/board").then((r) => r.json()).then((list: PublicOrder[]) => {
    const nowReady = list.filter((o) => o.status === "ready");
    const fresh = nowReady.filter((o) => !readyRef.current.has(o.code));
    if (initRef.current && fresh.length) { chime(); setQueue((q) => [...q, ...fresh]); }
    // `/pantalla?demo` anuncia el primer pedido listo al cargar, para probar sonido y takeover en la TV
    if (!initRef.current && nowReady.length && new URLSearchParams(location.search).has("demo")) { chime(); setQueue([nowReady[0]]); }
    readyRef.current = new Set(nowReady.map((o) => o.code)); initRef.current = true;
    setOrders(list);
  }).catch(() => {});

  useEffect(() => { preloadPandaListo().catch(() => {}); }, []); // frames del panda listos antes del primer takeover
  useEffect(() => { load(); const t = setInterval(load, 15000); const c = setInterval(() => setClock(new Date()), 1000); return () => { clearInterval(t); clearInterval(c); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useSocket({ "order:created": () => load(), "order:updated": () => load() });
  useEffect(() => { if (!queue.length) return; const t = setTimeout(() => setQueue((q) => q.slice(1)), TAKEOVER_MS); return () => clearTimeout(t); }, [queue]);

  const preparingAll = orders.filter((o) => o.status === "pending" || o.status === "preparing").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const readyAll = orders.filter((o) => o.status === "ready").sort((a, b) => (b.ready_at || "").localeCompare(a.ready_at || ""));
  const preparing = preparingAll.slice(0, MAX_PREPARING);
  const [featured, ...rest] = readyAll.slice(0, MAX_READY);
  const announcing = queue[0];

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#161513] text-[#fffdf8] font-sans select-none flex flex-col relative">
      {/* Fondo: brillo cálido arriba a la izquierda y menta a la derecha */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60vw 60vh at 0% 0%, rgba(242,145,90,0.10), transparent 60%), radial-gradient(70vw 80vh at 100% 60%, rgba(79,189,145,0.14), transparent 60%)" }} />

      <header className="relative shrink-0 h-[11vh] px-[3vw] flex items-center justify-between border-b border-white/[0.07]">
        <Wordmark height={vh(6.4)} color="#FFFDF8" />
        <div className="text-right leading-none">
          <div className="text-[5.2vh] font-black tabular-nums tracking-tight">{clock.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="mt-[0.8vh] text-[1.6vh] font-bold text-white/45 uppercase tracking-[0.25em]">{clock.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
      </header>

      <main className="relative flex-1 min-h-0 grid grid-cols-[5fr_7fr]">
        {/* Preparando */}
        <section className="min-h-0 flex flex-col p-[2.4vw] pr-[2vw] border-r border-white/[0.07]">
          <SectionTitle color="#5fbfe6" title="Preparando" count={preparingAll.length} />
          <div className="relative flex-1 min-h-0 mt-[2.2vh]">
            {preparing.length === 0 ? (
              <Empty>Sin pedidos en preparación</Empty>
            ) : (
              <div className="grid grid-cols-3 gap-[1.2vw] content-start">
                <AnimatePresence initial={false}>
                  {preparing.map((o) => (
                    <motion.div key={o.code} layout layoutId={`tile-${o.code}`} initial={{ opacity: 0, scale: 0.9, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85 }} transition={spring}
                      className="relative h-[15vh] rounded-[1.6vw] bg-white/[0.06] ring-1 ring-inset ring-white/[0.08] flex flex-col items-center justify-center overflow-hidden">
                      {o.status === "preparing" && <span className="absolute inset-x-0 top-0 h-[0.5vh] bg-gradient-to-r from-transparent via-sky to-transparent anim-shimmer" />}
                      <div className="text-[6.6vh] font-black leading-none tracking-tight tabular-nums">#{o.daily_number}</div>
                      <div className={`mt-[1.2vh] text-[1.5vh] font-extrabold uppercase tracking-[0.18em] ${o.status === "preparing" ? "text-sky" : "text-white/35"}`}>{o.status === "preparing" ? "En preparación" : "En cola"}</div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {preparingAll.length > MAX_PREPARING && <div className="h-[15vh] rounded-[1.6vw] border-2 border-dashed border-white/15 grid place-items-center text-[2.4vh] font-black text-white/40">+{preparingAll.length - MAX_PREPARING} más</div>}
              </div>
            )}
          </div>
        </section>

        {/* Listos */}
        <section className="min-h-0 flex flex-col p-[2.4vw] pl-[2vw]">
          <SectionTitle color="#4fbd91" title="¡Listo para retirar!" count={readyAll.length} pulse />
          <div className="relative flex-1 min-h-0 mt-[2.2vh] flex flex-col gap-[1.2vw]">
            {!featured ? (
              <div className="flex-1 rounded-[2vw] bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] grid place-items-center">
                <div className="text-center">
                  <PandaMark size={vh(26)} ink="#FFFDF8" className="mx-auto anim-wiggle opacity-90" />
                  <div className="mt-[3vh] text-[3.4vh] font-black">Tu pedido aparecerá aquí</div>
                  <div className="mt-[0.6vh] text-[2vh] font-bold text-white/40 tracking-wide">Café · Heladería · Bakery</div>
                </div>
              </div>
            ) : (
              <>
                <motion.div key={featured.code} layout layoutId={`tile-${featured.code}`} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
                  className="relative shrink-0 h-[38vh] rounded-[2vw] overflow-hidden bg-gradient-to-br from-[#5ccb9e] via-mint to-[#2f9a70] text-white shadow-[0_30px_80px_-30px_rgba(79,189,145,0.9)] flex items-center justify-between px-[3vw]">
                  <div className="absolute -right-[6vw] -top-[10vh] w-[28vw] h-[28vw] rounded-full bg-white/10 blur-2xl" />
                  <div className="relative min-w-0">
                    <div className="text-[2vh] font-extrabold uppercase tracking-[0.3em] text-white/80">Ya puedes retirar</div>
                    <div className="mt-[1vh] text-[18vh] font-black leading-[0.85] tracking-tighter tabular-nums drop-shadow-[0_6px_0_rgba(0,0,0,0.12)]">#{featured.daily_number}</div>
                    {featured.customer_name && <div className="mt-[2vh] text-[4.4vh] font-extrabold truncate">{displayName(featured)}</div>}
                  </div>
                  <div className="relative shrink-0 hidden lg:flex flex-col items-center gap-[1vh]">
                    <span className="w-[9vh] h-[9vh] rounded-full bg-white/20 ring-[0.8vh] ring-white/25 grid place-items-center anim-ring-w"><CheckIcon /></span>
                    <span className="text-[1.7vh] font-extrabold uppercase tracking-[0.2em] text-white/85">Mostrador</span>
                  </div>
                </motion.div>
                <div className="grid grid-cols-3 gap-[1.2vw] content-start">
                  <AnimatePresence initial={false}>
                    {rest.map((o) => (
                      <motion.div key={o.code} layout layoutId={`tile-${o.code}`} initial={{ opacity: 0, scale: 0.9, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85 }} transition={spring}
                        className="h-[15vh] rounded-[1.6vw] bg-mint/[0.16] ring-1 ring-inset ring-mint/40 text-white flex flex-col items-center justify-center px-[1vw]">
                        <div className="text-[6.6vh] font-black leading-none tracking-tight tabular-nums text-[#7fe0b8]">#{o.daily_number}</div>
                        <div className="mt-[1.2vh] text-[1.9vh] font-extrabold truncate max-w-full text-white/80">{o.customer_name ? displayName(o) : "Listo"}</div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="relative shrink-0 h-[7vh] px-[3vw] flex items-center justify-between border-t border-white/[0.07] text-[1.8vh] font-bold text-white/45">
        <span>Cuando tu número aparezca en <span className="text-mint">verde</span>, acércate al mostrador</span>
        <span className="flex items-center gap-[2vw]"><span><b className="text-white/80">{preparingAll.length}</b> preparando</span><span><b className="text-mint">{readyAll.length}</b> listos</span></span>
      </footer>

      {/* Takeover: pedido recién listo — panda saludando, número gigante y logo en negro para contrastar con el verde */}
      <AnimatePresence>
        {announcing && (
          <motion.div key={announcing.code} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
            className="absolute inset-0 z-50 text-white overflow-hidden"
            style={{ background: "radial-gradient(90vh 90vh at 18% 40%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 60%), radial-gradient(110vh 110vh at 90% 100%, #2b8f68 0%, rgba(43,143,104,0) 65%), linear-gradient(135deg, #5ccb9e 0%, #44b98a 55%, #33a076 100%)" }}>
            {/* logo en negro arriba */}
            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring, delay: 0.05 }} className="absolute top-[4vh] inset-x-0 flex justify-center">
              <Wordmark height={vh(8.5)} color="#232323" />
            </motion.div>

            <div className="absolute inset-0 flex items-center justify-center gap-[5vw] px-[6vw] pt-[6vh]">
              {/* panda animado dentro de un círculo blanco */}
              <motion.div initial={{ scale: 0.5, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ ...spring, delay: 0.15 }} className="relative shrink-0">
                {/* ondas que salen del panda */}
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 3.4, opacity: 0 }} transition={{ duration: 2.8, delay: 0.3 + i * 0.75, repeat: Infinity, ease: "easeOut" }}
                    className="absolute left-1/2 top-1/2 w-[46vh] h-[46vh] -ml-[23vh] -mt-[23vh] rounded-full border-[0.5vh] border-white/45" style={{ willChange: "transform, opacity" }} />
                ))}
                <div className="absolute -inset-[2.4vh] rounded-full bg-white/15" />
                <motion.div animate={{ y: [0, -1.6 * vh(1), 0] }} transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                  className="relative w-[46vh] h-[46vh] rounded-full bg-white overflow-hidden ring-[1vh] ring-white/40 shadow-[0_3vh_7vh_rgba(0,0,0,0.28)]" style={{ willChange: "transform" }}>
                  <PandaListo size={vh(46)} />
                </motion.div>
              </motion.div>

              <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...spring, delay: 0.25 }} className="relative text-center min-w-0">
                <div className="text-[3.2vh] font-black uppercase tracking-[0.32em] text-ink/90">¡Tu pedido está listo!</div>
                <div className="mt-[1vh] text-[32vh] font-black leading-[0.85] tracking-tighter tabular-nums drop-shadow-[0_1.2vh_0_rgba(35,35,35,0.22)]">#{announcing.daily_number}</div>
                {announcing.customer_name && <div className="mt-[2.5vh] text-[6.5vh] font-extrabold truncate">{displayName(announcing)}</div>}
                <div className="mt-[3.5vh] inline-flex items-center gap-[1vw] rounded-full bg-ink text-white px-[2.4vw] py-[1.5vh] text-[2.6vh] font-extrabold shadow-[0_1.5vh_3vh_rgba(0,0,0,0.25)]">
                  Acércate al mostrador <PandaMark size={vh(3.8)} ink="#FFFDF8" />
                </div>
              </motion.div>
            </div>

            <motion.div initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: TAKEOVER_MS / 1000, ease: "linear" }} className="absolute bottom-0 inset-x-0 h-[0.9vh] bg-ink/60 origin-left" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionTitle({ color, title, count, pulse }: { color: string; title: string; count: number; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-[1vw] shrink-0">
      <span className={`w-[1.6vh] h-[1.6vh] rounded-full ${pulse ? "anim-ring" : ""}`} style={{ background: color }} />
      <h2 className="text-[3.6vh] font-black tracking-tight">{title}</h2>
      <span className="ml-auto min-w-[4.4vh] h-[4.4vh] px-[1.2vh] rounded-full bg-white/[0.08] ring-1 ring-inset ring-white/10 grid place-items-center text-[2.2vh] font-black tabular-nums text-white/80">{count}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="h-full rounded-[2vw] border-2 border-dashed border-white/10 grid place-items-center text-[2.4vh] font-bold text-white/30">{children}</div>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" className="w-[5vh] h-[5vh]" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
