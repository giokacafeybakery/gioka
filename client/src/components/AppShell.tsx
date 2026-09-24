import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ShoppingBag, ChefHat, Wallet, Boxes, BarChart3, Settings2, MonitorPlay, LogOut, Bell, Smartphone } from "lucide-react";
import { PandaMark, Wordmark } from "./Logo";
import { Confirm } from "./ui";
import { useAuth } from "@/store/auth";
import { useSettings } from "@/store/settings";
import { api } from "@/lib/api";
import { logout as endSession } from "@/lib/actions";
import { setUiPreference } from "@/lib/nav";
import { SyncButton } from "./SyncStatus";
import { PrintStationButton, usePrintStationWatch, canPrint } from "./PrintStation";
import { useSocket } from "@/lib/socket";
import type { LowStock, Role } from "@/lib/types";
import { toast } from "@/store/toast";

interface NavItem { to: string; label: string; short: string; icon: ReactNode; roles: Role[]; badge?: number }

export default function AppShell() {
  const user = useAuth((s) => s.user);
  const nav = useNavigate();
  const load = useSettings((s) => s.load);
  const [low, setLow] = useState(0);
  const [confirmOut, setConfirmOut] = useState(false);

  // Caja/admin: este dispositivo puede imprimir solo las comandas que mandan los meseros.
  usePrintStationWatch();

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => {
    if (user?.role !== "admin") return;
    api.get<LowStock>("/api/inventory/low").then((l) => setLow(l.products.length + l.ingredients.length)).catch(() => {});
  }, [user]);
  useSocket({
    "stock:low": (items: { name: string; stock: number }[]) => {
      if (user?.role !== "admin") return;
      api.get<LowStock>("/api/inventory/low").then((l) => setLow(l.products.length + l.ingredients.length)).catch(() => {});
      toast.warning("Stock bajo", items.map((i) => i.name).slice(0, 3).join(", ") + (items.length > 3 ? "…" : ""));
    },
    "stock:updated": () => { api.clearCache(); if (user?.role !== "admin") return; api.get<LowStock>("/api/inventory/low").then((l) => setLow(l.products.length + l.ingredients.length)).catch(() => {}); },
    "sync:changed": () => { api.clearCache(); if (user?.role !== "admin") return; api.get<LowStock>("/api/inventory/low").then((l) => setLow(l.products.length + l.ingredients.length)).catch(() => {}); },
  }, [user?.role]);

  const items: NavItem[] = ([
    { to: "/pos", label: "Tomar pedido", short: "Pedido", icon: <ShoppingBag size={22} />, roles: ["admin", "cajero", "mesero"] },
    { to: "/pedidos", label: "Pedidos", short: "Pedidos", icon: <ChefHat size={22} />, roles: ["admin", "cajero", "cocina"] },
    { to: "/caja", label: "Caja", short: "Caja", icon: <Wallet size={22} />, roles: ["admin", "cajero"] },
    { to: "/inventario", label: "Inventario", short: "Stock", icon: <Boxes size={22} />, roles: ["admin"], badge: low },
    { to: "/reportes", label: "Reportes", short: "Reportes", icon: <BarChart3 size={22} />, roles: ["admin"] },
    { to: "/admin", label: "Administración", short: "Admin", icon: <Settings2 size={22} />, roles: ["admin"] },
  ] as NavItem[]).filter((i) => user && i.roles.includes(user.role));

  const doLogout = async () => {
    await endSession();
    nav("/login");
  };

  // Vuelta a la app móvil de inventario (el Perfil de esa app tiene el botón inverso).
  const toMobile = () => { setUiPreference("mobile"); nav("/app"); };

  const confirmLogout = () => {
    setConfirmOut(false);
    void doLogout();
  };

  const link = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all ${isActive ? "bg-peach text-white shadow-[0_8px_20px_-6px_rgba(242,145,90,0.8)]" : "text-white/55 hover:text-white hover:bg-white/10"}`;

  return (
    <div className="h-full flex flex-col md:flex-row bg-cream">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col items-center w-[84px] shrink-0 bg-ink text-white py-5 gap-2 rounded-r-3xl my-3 ml-3 shadow-lift">
        <NavLink to="/" className="mb-4 w-12 h-12 rounded-2xl bg-cream grid place-items-center hover:bg-white transition" title="Gioka">
          <PandaMark size={36} />
        </NavLink>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} className={link} title={i.label}>
            {i.icon}
            {!!i.badge && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-berry text-white text-[11px] font-black grid place-items-center ring-2 ring-ink">{i.badge}</span>}
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-ink text-white text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition shadow-lift z-20">{i.label}</span>
          </NavLink>
        ))}
        <div className="flex-1" />
        <a href="/pantalla" target="_blank" rel="noreferrer" className="group relative flex items-center justify-center w-12 h-12 rounded-2xl text-white/55 hover:text-white hover:bg-white/10 transition" title="Pantalla de clientes">
          <MonitorPlay size={22} />
          <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-ink text-white text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition shadow-lift z-20">Pantalla de clientes</span>
        </a>
        {(user?.role === "admin" || user?.role === "inventario") && (
          <button onClick={toMobile} className="group relative flex items-center justify-center w-12 h-12 rounded-2xl text-white/55 hover:text-white hover:bg-white/10 transition" title="Versión móvil">
            <Smartphone size={22} />
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-ink text-white text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition shadow-lift z-20">Versión móvil</span>
          </button>
        )}
        {canPrint(user?.role) && <PrintStationButton light className="w-12 h-12 rounded-2xl hover:bg-white/10" />}
        <SyncButton light className="w-12 h-12 rounded-2xl hover:bg-white/10" />
        <button onClick={() => setConfirmOut(true)} className="flex items-center justify-center w-12 h-12 rounded-2xl text-white/55 hover:text-white hover:bg-white/10 transition" title="Salir">
          <LogOut size={22} />
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 pt-[env(safe-area-inset-top,0px)] h-[calc(env(safe-area-inset-top,0px)+56px)] bg-ink text-white">
        <Wordmark height={26} color="#FFFDF8" />
        <div className="flex items-center gap-1">
          {!!low && <NavLink to="/inventario" className="relative w-10 h-10 grid place-items-center rounded-xl hover:bg-white/10"><Bell size={20} /><span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-berry text-[10px] font-black grid place-items-center">{low}</span></NavLink>}
          {canPrint(user?.role) && <PrintStationButton light className="w-10 h-10 rounded-xl hover:bg-white/10" />}
          <SyncButton light className="w-10 h-10 rounded-xl hover:bg-white/10" />
          <button onClick={() => setConfirmOut(true)} className="w-10 h-10 grid place-items-center rounded-xl hover:bg-white/10" aria-label="Salir"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
        <Outlet />
      </main>

      {/* Mobile bottom nav (hidden for the waiter: the POS is their only screen) */}
      {user?.role !== "mesero" && (
        <nav className="md:hidden flex items-stretch justify-around bg-ink text-white h-16 pb-[env(safe-area-inset-bottom)]">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={({ isActive }) => `relative flex flex-col items-center justify-center gap-0.5 flex-1 text-[10px] font-bold ${isActive ? "text-peach" : "text-white/55"}`}>
              {i.icon}<span>{i.short}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <Confirm open={confirmOut} onClose={() => setConfirmOut(false)} onConfirm={confirmLogout} title="¿Cerrar sesión?" message="Debes volver a iniciar sesión con tu correo y contraseña." confirmLabel="Salir" danger />
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  const user = useAuth((s) => s.user);
  return (
    <div className="flex flex-wrap items-center gap-3 md:gap-4 px-4 md:px-6 pt-4 md:pt-6 pb-3">
      <div className="min-w-0 mr-auto">
        <h1 className="h-title">{title}</h1>
        {subtitle && <p className="text-sm font-semibold text-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
      {user && (
        <div className="hidden lg:flex items-center gap-2.5 pl-3 border-l border-line">
          <div className="w-9 h-9 rounded-full bg-peach-soft text-peach-2 font-black grid place-items-center">{user.name[0]}</div>
          <div className="leading-tight"><div className="font-extrabold text-sm">{user.name}</div><div className="text-[11px] font-bold text-muted capitalize">{user.role}</div></div>
        </div>
      )}
    </div>
  );
}
