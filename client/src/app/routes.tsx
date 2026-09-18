// Mobile app — one lazy chunk (shell + every screen), mounted at /app/* so navigation inside the app never waits for the network.
import { Route, Routes } from "react-router-dom";
import MobileShell from "./MobileShell";
import AppHome from "./pages/Home";
import AppItem from "./pages/ItemDetail";
import AppAdjust from "./pages/Adjust";
import AppConfirm from "./pages/Confirm";
import AppDone from "./pages/Done";
import AppHistory from "./pages/History";
import AppAlerts from "./pages/Alerts";
import AppProfile from "./pages/Profile";

export default function MobileApp() {
  return (
    <Routes>
      <Route element={<MobileShell />}>
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
    </Routes>
  );
}
