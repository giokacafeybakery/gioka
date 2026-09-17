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
            <motion.nav key="tabs" initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="absolute left-0 right-0 bottom-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pointer-events-none">
              <div className="pointer-events-auto relative h-[68px] rounded-[26px] bg-ink text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)] flex items-center justify-around px-2">
                {TABS.map((t) => {
                  const active = to === t.to;
                  if (t.center) return (
                    <motion.button key={t.to} whileTap={{ scale: 0.9 }} onClick={() => nav(t.to)} aria-label={t.label}
                      className={`-mt-9 w-16 h-16 rounded-full grid place-items-center text-white shadow-[0_12px_28px_-8px_rgba(79,189,145,0.95)] ring-[6px] ring-app ${active ? "bg-mint-2" : "bg-mint"}`}>
                      <Plus size={30} strokeWidth={2.6} />
                    </motion.button>
                  );
                  const Icon = t.icon;
                  return (
                    <motion.button key={t.to} whileTap={{ scale: 0.88 }} onClick={() => nav(t.to)} aria-label={t.label}
                      className={`relative w-14 h-14 rounded-2xl grid place-items-center transition-colors ${active ? "text-white" : "text-white/45"}`}>
                      <Icon size={24} strokeWidth={active ? 2.4 : 2} />
                      {t.to === "/app/alertas" && lowCount > 0 && <span className="absolute top-2.5 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-berry text-[10px] font-bold grid place-items-center ring-2 ring-ink">{lowCount}</span>}
                      {active && <motion.span layoutId="tab-dot" className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full bg-mint" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
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
