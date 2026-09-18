import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { House, Bell, Plus, History, UserRound } from "lucide-react";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import { useSocket } from "@/lib/socket";
import { useInventory } from "./store";
import { stockStatus } from "./store";

const TABS = [
  { to: "/app", icon: House, label: "Inicio" },
  { to: "/app/alertas", icon: Bell, label: "Alertas" },
  { to: "/app/ajustar", icon: Plus, label: "Ajustar", center: true },
  { to: "/app/historial", icon: History, label: "Historial" },
  { to: "/app/perfil", icon: UserRound, label: "Perfil" },
];
const TAB_PATHS = TABS.map((t) => t.to);
const depth = (p: string) => p.replace(/\/$/, "").split("/").length;

export default function MobileShell() {
  const user = useAuth((s) => s.user);
  const loc = useLocation();
  const nav = useNavigate();
  const { items, load, loadMovements } = useInventory();
  const loadSettings = useSettings((s) => s.load);
  const prev = useRef(loc.pathname);

  useEffect(() => { load(); loadMovements(); loadSettings().catch(() => {}); }, [load, loadMovements, loadSettings]);
  useSocket({ "stock:updated": () => { load(); loadMovements(); }, "stock:low": () => load(), "order:created": () => { load(); loadMovements(); } });

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin" && user.role !== "inventario") return <Navigate to={user.role === "cocina" ? "/pedidos" : "/pos"} replace />;

  // Direction of the transition: deeper path = push (slide from right), shallower = pop, same depth = tab switch (fade)
  const from = prev.current, to = loc.pathname;
  const dir = TAB_PATHS.includes(from) && TAB_PATHS.includes(to) ? 0 : depth(to) > depth(from) ? 1 : depth(to) < depth(from) ? -1 : 0;
  prev.current = to;

  const showTabs = TAB_PATHS.includes(to);
  const lowCount = (items || []).filter((i) => stockStatus(i) !== "ok").length;

  return (
    <div className="h-full w-full bg-app font-app overflow-hidden flex justify-center">
      <div className="relative h-full w-full max-w-[520px] md:my-0 md:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_30px_80px_-30px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col">
        <div className="relative flex-1 min-h-0">
          <AnimatePresence initial={false} custom={dir}>
            <motion.div key={to} custom={dir} variants={pageVariants} initial="initial" animate="animate" exit="exit"
              transition={{ type: "spring", stiffness: 380, damping: 40, mass: 0.9 }} className="absolute inset-0" style={{ zIndex: dir >= 0 ? 2 : 1 }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showTabs && (
            <motion.nav key="tabs" initial={{ y: 96 }} animate={{ y: 0 }} exit={{ y: 96 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="absolute left-0 right-0 bottom-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pointer-events-none">
              <div className="pointer-events-auto relative h-[74px] rounded-[28px] bg-gradient-to-b from-[#2b2b2b] to-ink text-white ring-1 ring-inset ring-white/[0.07] shadow-[0_22px_44px_-18px_rgba(0,0,0,0.65),0_2px_6px_rgba(0,0,0,0.25)] grid grid-cols-5 items-stretch px-1.5">
                {TABS.map((t) => {
                  const active = to === t.to;
                  if (t.center) return (
                    <div key={t.to} className="relative flex flex-col items-center justify-end pb-1.5">
                      <motion.button whileTap={{ scale: 0.88 }} onClick={() => nav(t.to)} aria-label={t.label}
                        className="absolute -top-8 w-[62px] h-[62px] rounded-full grid place-items-center text-white ring-[5px] ring-app bg-gradient-to-b from-mint to-mint-2 shadow-[0_14px_30px_-8px_rgba(79,189,145,0.9),inset_0_1px_0_rgba(255,255,255,0.35)]">
                        <motion.span animate={{ rotate: active ? 90 : 0, scale: active ? 1.08 : 1 }} transition={{ type: "spring", stiffness: 420, damping: 28 }} className="grid place-items-center">
                          <Plus size={30} strokeWidth={2.7} />
                        </motion.span>
                      </motion.button>
                      <span className={`text-[10px] font-semibold tracking-wide transition-colors ${active ? "text-mint" : "text-white/50"}`}>{t.label}</span>
                    </div>
                  );
                  const Icon = t.icon;
                  const badge = t.to === "/app/alertas" ? lowCount : 0;
                  return (
                    <motion.button key={t.to} whileTap={{ scale: 0.9 }} onClick={() => nav(t.to)} aria-label={t.label}
                      className={`relative my-2 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors ${active ? "text-white" : "text-white/45"}`}>
                      {active && <motion.span layoutId="tab-pill" className="absolute inset-x-1 inset-y-0 rounded-2xl bg-white/[0.09] ring-1 ring-inset ring-white/[0.08]" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                      <span className="relative">
                        <Icon size={23} strokeWidth={active ? 2.4 : 2} />
                        <AnimatePresence>
                          {badge > 0 && (
                            <motion.span key="badge" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}
                              className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-berry text-white text-[10px] font-bold leading-none grid place-items-center ring-2 ring-[#262626]">
                              {badge > 99 ? "99+" : badge}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                      <span className={`relative text-[10px] tracking-wide ${active ? "font-bold" : "font-semibold"}`}>{t.label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const pageVariants = {
  initial: (d: number) => (d > 0 ? { x: "100%", opacity: 1 } : d < 0 ? { x: "-24%", opacity: 0.6 } : { opacity: 0, scale: 0.985, y: 6 }),
  animate: { x: 0, opacity: 1, scale: 1, y: 0 },
  exit: (d: number) => (d > 0 ? { x: "-24%", opacity: 0.6 } : d < 0 ? { x: "100%", opacity: 1 } : { opacity: 0, scale: 0.985, y: -6 }),
};
