import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { LogOut, Monitor, ChevronRight, Share, Smartphone, Boxes, History, CloudOff, CloudUpload, Wifi, RefreshCw } from "lucide-react";
import { PandaMark } from "@/components/Logo";
import { useAuth } from "@/store/auth";
import { logout as endSession } from "@/lib/actions";
import { useSyncSummary, SyncPanel } from "@/components/SyncStatus";
import { ROLE } from "@/lib/format";
import { homeFor, setUiPreference } from "@/lib/nav";
import { useInventory } from "../store";
import { Screen, Card, listVariants, rowVariants } from "../ui";
import { Modal } from "@/components/ui";
import { useState } from "react";

export default function Profile() {
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const sync = useSyncSummary();
  const [syncOpen, setSyncOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { items, movements } = useInventory();
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const mine = movements.filter((m) => m.user_name === user?.name && m.order_id == null).length;

  const doLogout = async () => { setConfirmOpen(false); await endSession(); nav("/login", { replace: true }); };

  // El admin trabaja en los dos lados: desde el teléfono puede pasarse a la versión de escritorio
  // (PDV, reportes, administración) y el dispositivo recuerda su elección.
  const toDesktop = () => { setUiPreference("desktop"); nav(homeFor(user!.role), { replace: true }); };

  return (
    <Screen title="Perfil" right={user?.role === "admin" ? (
      <motion.button whileTap={{ scale: 0.9 }} onClick={toDesktop} aria-label="Versión de escritorio" title="Versión de escritorio"
        className="w-10 h-10 rounded-full grid place-items-center bg-white text-ink shadow-app">
        <Monitor size={20} strokeWidth={2.2} />
      </motion.button>
    ) : undefined}>
      <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-3 pb-28">
        <motion.div variants={rowVariants}>
          <Card className="p-4 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-cream grid place-items-center"><PandaMark size={44} /></div>
            <div className="min-w-0"><div className="text-[18px] font-bold truncate">{user?.name}</div><div className="text-[13px] text-app-muted truncate">{user?.email}</div><span className="inline-block mt-1 text-[12px] font-semibold px-2 py-0.5 rounded-full bg-mint-soft text-mint-2">{user && ROLE[user.role]}</span></div>
          </Card>
        </motion.div>
        <motion.div variants={rowVariants}>
          <Card onClick={() => setSyncOpen(true)} className="p-4 flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${!sync.online ? "bg-butter-soft text-[#9a5b00]" : sync.failed ? "bg-berry-soft text-berry" : sync.pending ? "bg-sky-soft text-[#0f6f95]" : "bg-mint-soft text-mint-2"}`}>
              {sync.syncing ? <RefreshCw size={20} className="animate-spin" /> : !sync.online ? <CloudOff size={20} /> : sync.pending + sync.failed ? <CloudUpload size={20} /> : <Wifi size={20} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold">{!sync.online ? "Sin conexión" : sync.syncing ? "Enviando cambios…" : sync.failed ? "Cambios con error" : sync.pending ? "Cambios por enviar" : "Conectado y sincronizado"}</div>
              <div className="text-[13px] text-app-muted truncate">{!sync.online ? "Los ajustes se guardan en el teléfono y se envían solos" : sync.pending + sync.failed ? `${sync.pending + sync.failed} ${sync.pending + sync.failed === 1 ? "operación pendiente" : "operaciones pendientes"}` : "Todo lo que registraste está en el servidor"}</div>
            </div>
            <ChevronRight size={18} className="text-black/25" />
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
            <button onClick={() => setConfirmOpen(true)} className="w-full flex items-center gap-3 p-4 text-left text-berry"><LogOut size={20} /><span className="flex-1 text-[15px] font-semibold">Cerrar sesión</span></button>
          </Card>
        </motion.div>
        <motion.div variants={rowVariants} className="text-center text-[12px] text-app-muted pt-2">Gioka · Café · Heladería · Bakery</motion.div>
      </motion.div>
      <SyncPanel open={syncOpen} onClose={() => setSyncOpen(false)} />
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="¿Cerrar sesión?" width="max-w-sm"
        footer={<><button className="btn-ghost" onClick={() => setConfirmOpen(false)}>Cancelar</button><button className="btn-danger" onClick={() => void doLogout()}>Salir</button></>}>
        <div className="text-[15px] text-ink-3 font-semibold">Debes volver a iniciar sesión con tu correo y contraseña.</div>
      </Modal>
    </Screen>
  );
}
