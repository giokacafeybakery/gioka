import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { LogOut, Monitor, ChevronRight, Share, Smartphone, Boxes, History } from "lucide-react";
import { PandaMark } from "@/components/Logo";
import { useAuth } from "@/store/auth";
import { api } from "@/lib/api";
import { ROLE } from "@/lib/format";
import { useInventory } from "../store";
import { Screen, Card, listVariants, rowVariants } from "../ui";

export default function Profile() {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const { items, movements } = useInventory();
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const mine = movements.filter((m) => m.user_name === user?.name && m.order_id == null).length;

  const doLogout = async () => { try { await api.post("/api/auth/logout"); } catch { /* ignore */ } logout(); nav("/login", { replace: true }); };

  return (
    <Screen title="Perfil">
      <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-3 pb-28">
        <motion.div variants={rowVariants}>
          <Card className="p-4 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-cream grid place-items-center"><PandaMark size={44} /></div>
            <div className="min-w-0"><div className="text-[18px] font-bold truncate">{user?.name}</div><div className="text-[13px] text-app-muted truncate">{user?.email}</div><span className="inline-block mt-1 text-[12px] font-semibold px-2 py-0.5 rounded-full bg-mint-soft text-mint-2">{user && ROLE[user.role]}</span></div>
          </Card>
        </motion.div>
        <motion.div variants={rowVariants} className="grid grid-cols-2 gap-3">
          <Card className="p-4"><Boxes size={20} className="text-sky" /><div className="text-[24px] font-bold mt-2">{items?.length ?? "–"}</div><div className="text-[12px] text-app-muted">artículos en inventario</div></Card>
          <Card className="p-4"><History size={20} className="text-peach" /><div className="text-[24px] font-bold mt-2">{mine}</div><div className="text-[12px] text-app-muted">ajustes hechos por ti</div></Card>
        </motion.div>
        {!standalone && (
          <motion.div variants={rowVariants}>
            <Card className="p-4 flex gap-3">
              <div className="w-11 h-11 rounded-xl bg-peach-soft text-peach-2 grid place-items-center shrink-0"><Smartphone size={20} /></div>
              <div className="text-[13px] text-ink-3"><div className="font-bold text-ink text-[15px]">Instalar en tu teléfono</div>En iPhone toca <Share size={13} className="inline -mt-0.5" /> <b>Compartir → Añadir a pantalla de inicio</b>. En Android, usa el menú del navegador → <b>Instalar app</b>.</div>
            </Card>
          </motion.div>
        )}
        <motion.div variants={rowVariants}>
          <Card className="divide-y divide-black/5">
            {user?.role === "admin" && <button onClick={() => nav("/admin")} className="w-full flex items-center gap-3 p-4 text-left"><Monitor size={20} className="text-app-muted" /><span className="flex-1 text-[15px] font-semibold">Ir al sistema de escritorio</span><ChevronRight size={18} className="text-black/25" /></button>}
            <button onClick={doLogout} className="w-full flex items-center gap-3 p-4 text-left text-berry"><LogOut size={20} /><span className="flex-1 text-[15px] font-semibold">Cerrar sesión</span></button>
          </Card>
        </motion.div>
        <motion.div variants={rowVariants} className="text-center text-[12px] text-app-muted pt-2">Gioka · Café · Heladería · Bakery</motion.div>
      </motion.div>
    </Screen>
  );
}
