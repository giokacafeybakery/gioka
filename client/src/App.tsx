import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, Outlet } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Toasts } from "@/components/ui";
import { PrintHost } from "@/components/Receipt";
import { OfflineBar } from "@/components/SyncStatus";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { useAuth } from "@/store/auth";
import type { Role } from "@/lib/types";
import Login from "@/pages/Login";
import { homeFor } from "@/lib/nav";

// Every screen is its own chunk: the phone only downloads the mobile app, the POS only the POS, etc.
const Pos = lazy(() => import("@/pages/Pos"));
const Pedidos = lazy(() => import("@/pages/Pedidos"));
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
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

function Home() {
  const user = useAuth((s) => s.user);
  return <Navigate to={!user ? "/login" : homeFor(user.role)} replace />;
}

/** Neutral loading surface (same background as the destination) so chunk loads never flash white. */
const Fallback = ({ app = false }: { app?: boolean }) => <div className={`h-full w-full ${app ? "bg-app" : "bg-cream"}`} />;

export default function App() {
  return (
    <BrowserRouter>
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
      <UpdatePrompt />
      <PrintHost />
    </BrowserRouter>
  );
}
