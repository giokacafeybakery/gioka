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
              transition={{ type: "spring", stiffness: 380, damping: 40, mass: 0.9 }} className="absolute inset-0" style={{ zIndex: dir >= 0 ? 2 : 1, willChange: "transform, opacity", backfaceVisibility: "hidden" }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showTabs && (
            <motion.nav key="tabs" initial={{ y: 96, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 96, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="absolute left-0 right-0 bottom-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pointer-events-none flex justify-center">
              {/* soft fade so list content dissolves behind the floating hub */}
              <div className="absolute inset-x-0 bottom-0 h-[130px] bg-gradient-to-t from-app via-app/80 to-transparent" aria-hidden />
              <motion.div layout className="relative pointer-events-auto flex items-center gap-1 p-1.5 rounded-full bg-gradient-to-b from-[#2e2e2e] to-[#1c1c1c] ring-1 ring-inset ring-white/[0.08] shadow-[0_24px_48px_-16px_rgba(0,0,0,0.6),0_2px_6px_rgba(0,0,0,0.25)]">
                {TABS.map((t) => {
                  const active = to === t.to;
                  const Icon = t.icon;
                  const badge = t.to === "/app/alertas" ? lowCount : 0;
                  const accent = !!t.center;
                  return (
                    <motion.button key={t.to} layout whileTap={{ scale: 0.92 }} onClick={() => nav(t.to)} aria-label={t.label} aria-current={active ? "page" : undefined}
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      className={`relative h-[50px] rounded-full flex items-center justify-center gap-2 overflow-hidden ${active ? "px-4" : "w-[50px]"} ${
                        active ? (accent ? "text-white" : "text-ink") : accent ? "text-white" : "text-white/60"}`}>
                      {/* background: dark disc when inactive, white/mint pill when active */}
                      {active
                        ? <motion.span layoutId="tab-active" transition={{ type: "spring", stiffness: 480, damping: 38 }} className={`absolute inset-0 rounded-full ${accent ? "bg-gradient-to-b from-mint to-mint-2 shadow-[0_8px_20px_-8px_rgba(79,189,145,0.9)]" : "bg-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)]"}`} />
                        : <span className={`absolute inset-0 rounded-full ${accent ? "bg-gradient-to-b from-mint to-mint-2 shadow-[0_8px_20px_-8px_rgba(79,189,145,0.9)]" : "bg-white/[0.07]"}`} />}
                      <motion.span layout="position" className="relative grid place-items-center">
                        <Icon size={accent ? 24 : 21} strokeWidth={accent ? 2.6 : active ? 2.4 : 2} />
                        <AnimatePresence>
                          {badge > 0 && !active && (
                            <motion.span key="badge" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}
                              className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-berry text-white text-[9px] font-bold leading-none grid place-items-center ring-2 ring-[#232323]">
                              {badge > 99 ? "99+" : badge}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.span>
                      <AnimatePresence initial={false}>
                        {active && (
                          <motion.span key="label" initial={{ opacity: 0, x: -6, width: 0 }} animate={{ opacity: 1, x: 0, width: "auto" }} exit={{ opacity: 0, x: -6, width: 0 }} transition={{ type: "spring", stiffness: 480, damping: 38 }}
                            className="relative text-[14px] font-bold tracking-tight whitespace-nowrap overflow-hidden">
                            {t.label}{badge > 0 && <span className="ml-1.5 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-berry text-white text-[10px] font-bold align-middle">{badge > 99 ? "99+" : badge}</span>}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </motion.div>
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
