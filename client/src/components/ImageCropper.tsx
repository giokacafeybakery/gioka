import { useEffect, useRef, useState } from "react";
import { RotateCw, RefreshCcw, ZoomIn, ZoomOut, Check, Move } from "lucide-react";
import { Modal } from "./ui";

const VIEW = 320;   // tamaño del recuadro en px CSS
const OUT = 800;    // tamaño de salida (cuadrado)
const MAX_ZOOM = 4;

/** Recorte cuadrado con arrastre, zoom (rueda, pellizco o barra) y giro de 90°. Devuelve un JPEG data URL. */
export function ImageCropper({ src, open, onClose, onDone, title = "Ajustar foto" }: {
  src: string | null; open: boolean; onClose: () => void; onDone: (dataUrl: string) => void; title?: string;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    if (!open || !src) return;
    setImg(null); setZoom(1); setRot(0); setOff({ x: 0, y: 0 }); setError(null);
    const im = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) im.crossOrigin = "anonymous";
    im.onload = () => setImg(im);
    im.onerror = () => setError("No se pudo cargar la imagen");
    im.src = src;
  }, [open, src]);

  // Dimensiones giradas y escala base (cover) para que la foto siempre llene el recuadro.
  const W = img?.naturalWidth || 1, H = img?.naturalHeight || 1;
  const [Wr, Hr] = rot % 180 ? [H, W] : [W, H];
  const base = Math.max(VIEW / Wr, VIEW / Hr);
  const s = base * zoom;
  const clamp = (o: { x: number; y: number }, z = zoom) => {
    const sc = base * z, mx = Math.max(0, (Wr * sc - VIEW) / 2), my = Math.max(0, (Hr * sc - VIEW) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const setZoomAt = (z: number) => { const nz = Math.min(MAX_ZOOM, Math.max(1, z)); setZoom(nz); setOff((o) => clamp({ x: o.x * nz / zoom, y: o.y * nz / zoom }, nz)); };
  const rotate = () => { setRot((r) => (r + 90) % 360); setOff({ x: 0, y: 0 }); };
  const reset = () => { setZoom(1); setRot(0); setOff({ x: 0, y: 0 }); };

  // Rueda del mouse: zoom (listener no pasivo para poder cancelar el scroll del modal).
  useEffect(() => {
    const el = box.current; if (!el || !open) return;
    const h = (e: WheelEvent) => { e.preventDefault(); setZoomAt(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  });

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }; drag.current = null;
    } else drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      setZoomAt(pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist);
    } else if (drag.current?.id === e.pointerId) {
      setOff(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (drag.current?.id === e.pointerId) drag.current = null;
    if (pointers.current.size < 2) pinch.current = null;
  };

  const apply = () => {
    if (!img) return;
    setBusy(true);
    try {
      const k = OUT / VIEW;
      const c = document.createElement("canvas"); c.width = OUT; c.height = OUT;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, OUT, OUT);
      ctx.imageSmoothingQuality = "high";
      ctx.translate(OUT / 2 + off.x * k, OUT / 2 + off.y * k);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, (-W * s * k) / 2, (-H * s * k) / 2, W * s * k, H * s * k);
      onDone(c.toDataURL("image/jpeg", 0.86));
    } catch {
      setError("No se pudo procesar la imagen. Vuelve a subirla desde tu dispositivo.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle="Arrastra para encuadrar, usa la barra o pellizca para acercar" width="max-w-md"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!img || busy} onClick={apply}><Check size={18} /> Aplicar</button></>}>
      <div className="flex flex-col items-center gap-4">
        <div ref={box} className="relative rounded-2xl overflow-hidden bg-ink select-none touch-none cursor-grab active:cursor-grabbing shadow-inner"
          style={{ width: VIEW, height: VIEW, maxWidth: "100%" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {img ? (
            <img src={img.src} alt="" draggable={false} className="absolute left-1/2 top-1/2 max-w-none will-change-transform"
              style={{ width: W * s, height: H * s, transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px)) rotate(${rot}deg)` }} />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white/70 text-sm font-bold px-6 text-center">{error || "Cargando…"}</div>
          )}
          {/* Guías de tercios */}
          <div className="absolute inset-0 pointer-events-none opacity-40">
            <div className="absolute top-1/3 inset-x-0 border-t border-white/70" /><div className="absolute top-2/3 inset-x-0 border-t border-white/70" />
            <div className="absolute left-1/3 inset-y-0 border-l border-white/70" /><div className="absolute left-2/3 inset-y-0 border-l border-white/70" />
          </div>
          <div className="absolute inset-0 pointer-events-none rounded-2xl ring-2 ring-inset ring-white/60" />
          {img && zoom === 1 && off.x === 0 && off.y === 0 && (
            <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
              <span className="pill bg-ink/70 text-white text-[11px]"><Move size={11} /> Arrastra para mover</span>
            </div>
          )}
        </div>
        <div className="w-full flex items-center gap-2" style={{ maxWidth: VIEW }}>
          <button className="btn-icon btn-ghost w-9 h-9" onClick={() => setZoomAt(zoom / 1.2)} disabled={!img || zoom <= 1} aria-label="Alejar"><ZoomOut size={16} /></button>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} disabled={!img} onChange={(e) => setZoomAt(Number(e.target.value))} className="flex-1 accent-peach" aria-label="Zoom" />
          <button className="btn-icon btn-ghost w-9 h-9" onClick={() => setZoomAt(zoom * 1.2)} disabled={!img || zoom >= MAX_ZOOM} aria-label="Acercar"><ZoomIn size={16} /></button>
          <span className="w-px h-6 bg-line mx-1" />
          <button className="btn-icon btn-ghost w-9 h-9" onClick={rotate} disabled={!img} aria-label="Girar 90°" title="Girar"><RotateCw size={16} /></button>
          <button className="btn-icon btn-ghost w-9 h-9" onClick={reset} disabled={!img || (zoom === 1 && rot === 0 && !off.x && !off.y)} aria-label="Restablecer" title="Restablecer"><RefreshCcw size={16} /></button>
        </div>
        {error && img && <p className="text-sm text-berry font-bold text-center">{error}</p>}
      </div>
    </Modal>
  );
}
