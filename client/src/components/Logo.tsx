/**
 * Marca Gioka — imágenes reales del logo (client/public/brand, generadas por scripts/make-brand.py).
 * `mark` = panda en la taza; `wordmark` = GIOKA + Café · Heladería · Bakery.
 * Las variantes blancas se eligen automáticamente cuando el color pedido es claro (fondos oscuros).
 */
const isLight = (c: string) => {
  const m = c.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(m)) return c.toLowerCase().includes("fff") || c.toLowerCase() === "white";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
};

/** Panda en la taza. `ink` claro → versión blanca. `face` se mantiene por compatibilidad. */
export function PandaMark({ size = 40, className = "", ink = "#232323" }: { size?: number; className?: string; ink?: string; face?: string }) {
  const src = isLight(ink) ? "/brand/mark-white.png" : "/brand/mark.png";
  // The artwork is wider than tall (876×740) — `size` is the width so it fits the same slots as before.
  return <img src={src} width={size} height={Math.round(size * 0.845)} alt="" aria-hidden="true" draggable={false} className={`select-none ${className}`} style={{ width: size, height: "auto" }} />;
}

/** Logotipo completo (GIOKA con el panda como O + tagline). `height` es la altura total. */
export function Wordmark({ height = 32, color = "#232323", className = "" }: { height?: number; color?: string; face?: string; className?: string }) {
  const src = isLight(color) ? "/brand/wordmark-white.png" : "/brand/wordmark.png";
  return <img src={src} alt="Gioka — Café · Heladería · Bakery" draggable={false} className={`select-none ${className}`} style={{ height, width: "auto" }} />;
}

export function LogoLockup({ dark = false, size = 40 }: { dark?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid place-items-center rounded-2xl ${dark ? "bg-white/10" : "bg-cream"}`} style={{ width: size + 12, height: size + 12 }}>
        <PandaMark size={size * 0.9} ink={dark ? "#FFFDF8" : "#232323"} />
      </div>
      <Wordmark height={size * 0.85} color={dark ? "#FFFDF8" : "#232323"} />
    </div>
  );
}
