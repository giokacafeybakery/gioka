import { useNavigate } from "react-router-dom";
import { PandaMark } from "@/components/Logo";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const nav = useNavigate();
  return (
    <div className="h-full flex flex-col items-center justify-center bg-cream px-6 text-center">
      <div className="w-24 h-24 rounded-3xl bg-peach-soft grid place-items-center mb-6 anim-pop">
        <PandaMark size={64} />
      </div>
      <h1 className="text-6xl font-black text-ink tracking-tight mb-2">404</h1>
      <p className="text-lg font-bold text-muted mb-1">Página no encontrada</p>
      <p className="text-sm font-semibold text-muted/70 max-w-xs mb-8">La página que buscas no existe o fue movida. Vuelve al inicio para continuar.</p>
      <div className="flex gap-3">
        <button className="btn-ghost" onClick={() => nav(-1)}><ArrowLeft size={18} /> Volver</button>
        <button className="btn-primary" onClick={() => nav("/")}><Home size={18} /> Ir al inicio</button>
      </div>
    </div>
  );
}
