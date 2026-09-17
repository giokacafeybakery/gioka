import { BrowserRouter, Navigate, Route, Routes, Outlet } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Toasts } from "@/components/ui";
import { PrintHost } from "@/components/Receipt";
import { useAuth } from "@/store/auth";
import type { Role } from "@/lib/types";
import Login from "@/pages/Login";
import Pos from "@/pages/Pos";
import Pedidos from "@/pages/Pedidos";
import Caja from "@/pages/Caja";
import Inventario from "@/pages/Inventario";
import Admin from "@/pages/Admin";
import Reportes from "@/pages/Reportes";
import Pantalla from "@/pages/Pantalla";
import Seguir from "@/pages/Seguir";
import MobileShell from "@/app/MobileShell";
import { homeFor } from "@/lib/nav";
import AppHome from "@/app/pages/Home";
import AppItem from "@/app/pages/ItemDetail";
import AppAdjust from "@/app/pages/Adjust";
import AppConfirm from "@/app/pages/Confirm";
import AppDone from "@/app/pages/Done";
import AppHistory from "@/app/pages/History";
import AppAlerts from "@/app/pages/Alerts";
import AppProfile from "@/app/pages/Profile";


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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pantalla" element={<Pantalla />} />
        <Route path="/seguir" element={<Seguir />} />
        <Route path="/seguir/:code" element={<Seguir />} />
        <Route path="/app" element={<MobileShell />}>
          <Route index element={<AppHome />} />
          <Route path="ajustar" element={<AppHome pick />} />
          <Route path="ajustar/confirmar" element={<AppConfirm />} />
          <Route path="ajustar/listo" element={<AppDone />} />
          <Route path="item/:key" element={<AppItem />} />
          <Route path="item/:key/ajustar" element={<AppAdjust />} />
          <Route path="historial" element={<AppHistory />} />
          <Route path="alertas" element={<AppAlerts />} />
          <Route path="perfil" element={<AppProfile />} />
        </Route>
        <Route element={<Guard />}>
          <Route element={<AppShell />}>
            <Route element={<Guard roles={["admin", "cajero"]} />}>
              <Route path="/pos" element={<Pos />} />
              <Route path="/caja" element={<Caja />} />
            </Route>
            <Route path="/pedidos" element={<Pedidos />} />
            <Route element={<Guard roles={["admin", "cajero"]} />}>
              <Route path="/inventario" element={<Inventario />} />
            </Route>
            <Route element={<Guard roles={["admin"]} />}>
              <Route path="/admin" element={<Admin />} />
              <Route path="/reportes" element={<Reportes />} />
            </Route>
          </Route>
        </Route>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Toasts />
      <PrintHost />
    </BrowserRouter>
  );
}
