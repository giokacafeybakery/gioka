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

function Guard({ roles }: { roles?: Role[] }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === "cocina" ? "/pedidos" : "/pos"} replace />;
  return <Outlet />;
}

function Home() {
  const user = useAuth((s) => s.user);
  return <Navigate to={!user ? "/login" : user.role === "cocina" ? "/pedidos" : "/pos"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pantalla" element={<Pantalla />} />
        <Route path="/seguir" element={<Seguir />} />
        <Route path="/seguir/:code" element={<Seguir />} />
        <Route element={<Guard />}>
          <Route element={<AppShell />}>
            <Route element={<Guard roles={["admin", "cajero"]} />}>
              <Route path="/pos" element={<Pos />} />
              <Route path="/caja" element={<Caja />} />
              <Route path="/inventario" element={<Inventario />} />
            </Route>
            <Route path="/pedidos" element={<Pedidos />} />
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
