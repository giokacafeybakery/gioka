import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CloudUpload, CheckCircle2, AlertTriangle, Trash2, RotateCcw, Wifi, ShoppingBag, Banknote, ChefHat, UtensilsCrossed, Wallet, Boxes, PackagePlus } from "lucide-react";
import { Modal } from "./ui";
import { useNet, probe } from "@/lib/offline/net";
import { useQueue, type Op } from "@/lib/offline/queue";
import { flush, retryAll, retryOp, discardOp } from "@/lib/offline/sync";
import { useAuth } from "@/store/auth";
import { dateTime } from "@/lib/format";

/**
 * Connectivity + sync indicator shared by the desktop system and the mobile app.
 * A floating pill appears only when something is worth knowing (offline, changes waiting, sending, just finished);
 * tapping it opens the panel with every pending/failed operation.
 */
export function useSyncSummary() {
  const online = useNet((s) => s.online);
  const known = useNet((s) => s.known);
  const ops = useQueue((s) => s.ops);
  const syncing = useQueue((s) => s.syncing);
  const pending = ops.filter((o) => o.state === "pending").length;
  const failed = ops.filter((o) => o.state === "failed").length;
  return { online, known, pending, failed, syncing, total: ops.length };
}

const ICON: Record<Op["kind"], React.ReactNode> = {
  "order.create": <ShoppingBag size={16} />, "order.pay": <Banknote size={16} />, "order.status": <ChefHat size={16} />, "order.items": <UtensilsCrossed size={16} />,
  "cash.open": <Wallet size={16} />, "cash.close": <Wallet size={16} />, "stock.adjust": <Boxes size={16} />, "ingredient.create": <PackagePlus size={16} />,
};

export function OfflineBar() {
  const user = useAuth((s) => s.user);
  const { online, known, pending, failed, syncing } = useSyncSummary();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const lastSyncAt = useQueue((s) => s.lastSyncAt);

  // Brief "todo sincronizado" confirmation after the queue empties.
  useEffect(() => { if (lastSyncAt && !pending && !failed) { setFlash(true); const t = setTimeout(() => setFlash(false), 2500); return () => clearTimeout(t); } }, [lastSyncAt, pending, failed]);

  if (!user || !known) return null;
  const show = !online || pending > 0 || failed > 0 || syncing || flash;
  if (!show) return null;

  let tone = "bg-ink text-white"; let icon: React.ReactNode; let text: string;
  if (syncing) { icon = <RefreshCw size={15} className="animate-spin" />; text = `Enviando ${pending} ${pending === 1 ? "cambio" : "cambios"}…`; tone = "bg-sky text-white"; }
  else if (!online) { icon = <CloudOff size={15} />; text = pending ? `Sin conexión · ${pending} por enviar` : "Sin conexión · trabajando en este dispositivo"; }
  else if (failed) { icon = <AlertTriangle size={15} />; text = `${failed} ${failed === 1 ? "cambio no se pudo enviar" : "cambios no se pudieron enviar"}`; tone = "bg-berry text-white"; }
  else if (pending) { icon = <CloudUpload size={15} />; text = `${pending} por enviar`; tone = "bg-butter text-ink"; }
  else { icon = <CheckCircle2 size={15} />; text = "Todo sincronizado"; tone = "bg-mint text-white"; }

  return (
    <>
      <div className="fixed z-[70] left-0 right-0 top-[calc(env(safe-area-inset-top,0px)+8px)] flex justify-center pointer-events-none px-4">
        <button onClick={() => setOpen(true)} className={`pointer-events-auto inline-flex items-center gap-2 h-9 pl-3 pr-3.5 rounded-full text-[13px] font-extrabold shadow-pop anim-fade-up ${tone}`}>
          {icon}<span className="truncate max-w-[70vw]">{text}</span>
        </button>
      </div>
      <SyncPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Small icon button for sidebars / headers that opens the panel; shows a badge with the pending count. */
export function SyncButton({ className = "", light = false }: { className?: string; light?: boolean }) {
  const { online, pending, failed, syncing } = useSyncSummary();
  const [open, setOpen] = useState(false);
  const n = pending + failed;
  const color = !online ? "text-butter" : failed ? "text-berry" : light ? "text-white/55 hover:text-white" : "text-muted hover:text-ink";
  return (
    <>
      <button onClick={() => setOpen(true)} className={`relative grid place-items-center transition ${color} ${className}`} title={!online ? "Sin conexión" : n ? `${n} cambios por enviar` : "Conectado"}>
        {syncing ? <RefreshCw size={22} className="animate-spin" /> : !online ? <CloudOff size={22} /> : n ? <CloudUpload size={22} /> : <Wifi size={22} />}
        {!!n && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-berry text-white text-[11px] font-black grid place-items-center ring-2 ring-ink">{n}</span>}
      </button>
      <SyncPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function SyncPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { online, pending, failed, syncing } = useSyncSummary();
  const ops = useQueue((s) => s.ops);
  const lastError = useQueue((s) => s.lastSyncError);
  const lastSyncAt = useQueue((s) => s.lastSyncAt);
  const checking = useNet((s) => s.checking);
  const netError = useNet((s) => s.lastError);
  const token = useAuth((s) => s.token);

  return (
    <Modal open={open} onClose={onClose} title="Sincronización" subtitle={online ? "Conectado al servidor" : "Sin conexión con el servidor"} width="max-w-md"
      footer={<>
        {failed > 0 && <button className="btn-soft mr-auto" onClick={() => retryAll()}><RotateCcw size={16} /> Reintentar fallidos</button>}
        <button className="btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn-primary" disabled={syncing || checking} onClick={() => (online ? flush() : probe().then((ok) => { if (ok) void flush(); }))}>
          {syncing || checking ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />} {online ? "Enviar ahora" : "Reintentar conexión"}
        </button>
      </>}>
      <div className={`rounded-2xl p-4 flex items-start gap-3 ${online ? "bg-mint-soft text-mint-2" : "bg-butter-soft text-[#9a6b00]"}`}>
        <div className="shrink-0 mt-0.5">{online ? <Wifi size={20} /> : <CloudOff size={20} />}</div>
        <div className="text-sm font-bold leading-snug">
          {online
            ? (pending ? `Enviando los cambios pendientes${syncing ? "…" : "."}` : "Todo lo que hiciste ya está en el servidor.")
            : "Puedes seguir vendiendo, cobrando y ajustando stock: todo se guarda en este dispositivo y se enviará solo cuando vuelva la conexión."}
          {!online && netError && <div className="text-xs font-semibold opacity-80 mt-1">{netError}</div>}
          {!token && pending > 0 && <div className="text-xs font-semibold mt-1">Inicia sesión con conexión para enviar los cambios.</div>}
          {lastError && online && <div className="text-xs font-semibold opacity-80 mt-1">{lastError}</div>}
          {lastSyncAt && !pending && <div className="text-xs font-semibold opacity-80 mt-1">Último envío: {dateTime(new Date(lastSyncAt).toISOString())}</div>}
        </div>
      </div>

      {ops.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line overflow-hidden">
          {ops.map((op) => (
            <li key={op.id} className="flex items-center gap-3 px-3 py-2.5 bg-paper">
              <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${op.state === "failed" ? "bg-berry-soft text-berry" : "bg-cream text-ink-3"}`}>{ICON[op.kind]}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold truncate">{op.label}</div>
                <div className="text-[11px] font-semibold text-muted truncate">{dateTime(op.at)} · {op.user.name}{op.state === "failed" && op.error ? ` · ${op.error}` : ""}</div>
              </div>
              {op.state === "failed" ? (
                <div className="flex gap-1 shrink-0">
                  <button className="btn-icon btn-ghost w-9 h-9" title="Reintentar" onClick={() => retryOp(op.id)}><RotateCcw size={16} /></button>
                  <button className="btn-icon btn-ghost w-9 h-9 text-berry" title="Descartar" onClick={() => { if (confirm("¿Descartar este cambio? No se enviará al servidor.")) discardOp(op.id); }}><Trash2 size={16} /></button>
                </div>
              ) : <span className="pill bg-butter-soft text-[#9a6b00] shrink-0">Pendiente</span>}
            </li>
          ))}
        </ul>
      )}
      {ops.length === 0 && <p className="mt-4 text-center text-sm font-semibold text-muted">No hay cambios pendientes.</p>}
    </Modal>
  );
}
