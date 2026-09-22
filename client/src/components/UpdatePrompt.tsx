import { RefreshCw, Sparkles } from "lucide-react";
import { useAppUpdate } from "@/store/update";
import { toast } from "@/store/toast";

export function UpdatePrompt() {
  const available = useAppUpdate((s) => s.available);
  const updating = useAppUpdate((s) => s.updating);
  const apply = useAppUpdate((s) => s.apply);

  if (!available) return null;

  const update = async () => {
    try {
      await apply();
    } catch {
      toast.error("No se pudo actualizar", "Comprueba la conexión e inténtalo de nuevo.");
    }
  };

  return (
    <aside
      className="fixed z-[80] left-3 right-3 bottom-3 sm:left-auto sm:right-5 sm:bottom-5 sm:w-[420px] rounded-2xl bg-ink text-white shadow-pop border border-white/10 p-4 anim-fade-up"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-peach text-white grid place-items-center shrink-0">
          <Sparkles size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-black leading-tight">Nueva actualización disponible</div>
          <div className="text-xs text-white/65 font-semibold mt-1">Actualiza para usar la versión más reciente.</div>
        </div>
        <button className="btn-primary btn-sm shrink-0" onClick={() => void update()} disabled={updating}>
          <RefreshCw size={15} className={updating ? "animate-spin" : ""} />
          {updating ? "Actualizando…" : "Actualizar"}
        </button>
      </div>
    </aside>
  );
}
