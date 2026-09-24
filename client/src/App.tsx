import { Component, lazy, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, Outlet } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Toasts } from "@/components/ui";
import { PrintHost } from "@/components/Receipt";
import { OfflineBar } from "@/components/SyncStatus";
import { useAuth } from "@/store/auth";
import type { Role } from "@/lib/types";
import Login from "@/pages/Login";
import { homeFor } from "@/lib/nav";

// Every screen is its own chunk: the phone only downloads the mobile app, the POS only the POS, etc.
const Pos = lazy(() => import("@/pages/Pos"));
const Pedidos = lazy(() => import("@/pages/Pedidos"));
const Mesas = lazy(() => import("@/pages/Mesas"));
const Caja = lazy(() => import("@/pages/Caja"));
const Inventario = lazy(() => import("@/pages/Inventario"));
const Admin = lazy(() => import("@/pages/Admin"));
const Reportes = lazy(() => import("@/pages/Reportes"));
const Pantalla = lazy(() => import("@/pages/Pantalla"));
const Seguir = lazy(() => import("@/pages/Seguir"));
const MobileApp = lazy(() => import("@/app/routes"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function Guard({ roles }: { roles?: Role[] }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const target = homeFor(user.role);
    // Redirecting to the same path loops forever and leaves a blank screen. If the role has no
    // other valid landing, give a visible screen instead of silently breaking the app.
    if (target === window.location.pathname) return <NotFound />;
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}

function Home() {
  const user = useAuth((s) => s.user);
  return <Navigate to={!user ? "/login" : homeFor(user.role)} replace />;
}

/** Neutral loading surface (same background as the destination) so chunk loads never flash white. */
const Fallback = ({ app = false }: { app?: boolean }) => <div className={`h-full w-full ${app ? "bg-app" : "bg-cream"}`} />;

/** Last line of defense: a chunk failing to load or a render crash shows this instead of a blank screen. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("ui-crash", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center bg-cream px-6 text-center">
          <div className="max-w-xs">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-paper border border-line grid place-items-center shadow-soft"><AlertTriangle size={28} className="text-peach" /></div>
            <h1 className="mt-5 text-xl font-black text-ink">Algo salió mal</h1>
            <p className="mt-2 text-sm font-semibold text-muted leading-relaxed">La pantalla no pudo cargar. Recarga para continuar; tus datos y operaciones están a salvo en este dispositivo.</p>
            <button className="btn-primary mt-6 w-full" onClick={() => window.location.reload()}>Recargar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <Boundary>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/pantalla" element={<Pantalla />} />
            <Route path="/seguir" element={<Seguir />} />
            <Route path="/seguir/:code" element={<Seguir />} />
            <Route path="/app/*" element={<Suspense fallback={<Fallback app />}><MobileApp /></Suspense>} />
            <Route element={<Guard />}>
              <Route element={<AppShell />}>
                <Route element={<Guard roles={["admin", "cajero", "mesero"]} />}>
                  <Route path="/pos" element={<Pos />} />
                </Route>
                <Route element={<Guard roles={["admin", "cajero"]} />}>
                  <Route path="/mesas" element={<Mesas />} />
                  <Route path="/caja" element={<Caja />} />
                </Route>
                <Route element={<Guard roles={["admin", "cajero", "cocina"]} />}>
                  <Route path="/pedidos" element={<Pedidos />} />
                </Route>
                <Route element={<Guard roles={["admin"]} />}>
                  <Route path="/inventario" element={<Inventario />} />
                </Route>
                <Route element={<Guard roles={["admin"]} />}>
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/reportes" element={<Reportes />} />
                </Route>
              </Route>
            </Route>
            <Route path="/" element={<Home />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toasts />
        <OfflineBar />
        <PrintHost />
      </Boundary>
    </BrowserRouter>
  );
}
