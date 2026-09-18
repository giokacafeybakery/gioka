import { useEffect, useRef } from "react";

/*
 * Panda con auricular que saluda cuando un pedido está listo (pantalla pública).
 * Los frames viven en /anim/panda-listo (webp únicos + manifest con el orden y los fps) y se dibujan en un canvas:
 * sin dependencia de lottie-web y con control total del bucle. Cada frame es de 800×600 con el panda centrado;
 * el cuadrado central de 480 px es lo que se muestra dentro del círculo.
 */
type Manifest = { fps: number; w: number; h: number; frames: number[] };
type Loaded = { manifest: Manifest; images: HTMLImageElement[] };
const CROP = 480;

let cache: Promise<Loaded> | null = null;
/** Descarga y decodifica todos los frames una sola vez (llamar al montar la pantalla para que el takeover salga al instante). */
export function preloadPandaListo(): Promise<Loaded> {
  cache ||= fetch("/anim/panda-listo/manifest.json").then((r) => r.json()).then(async (manifest: Manifest) => {
    const n = Math.max(...manifest.frames) + 1;
    const images = await Promise.all(Array.from({ length: n }, (_, i) => new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `/anim/panda-listo/${String(i).padStart(3, "0")}.webp`;
    })));
    return { manifest, images };
  }).catch((e) => { cache = null; throw e; });
  return cache;
}

export function PandaListo({ size, className = "" }: { size: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0; let alive = true;
    preloadPandaListo().then(({ manifest, images }) => {
      const c = ref.current; if (!c || !alive) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
      const ctx = c.getContext("2d"); if (!ctx) return;
      const sx = (manifest.w - CROP) / 2, sy = (manifest.h - CROP) / 2;
      const start = performance.now(); let last = -1;
      const tick = (t: number) => {
        const i = Math.floor(((t - start) / 1000) * manifest.fps) % manifest.frames.length;
        if (i !== last) { last = i; ctx.drawImage(images[manifest.frames[i]], sx, sy, CROP, CROP, 0, 0, c.width, c.height); }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => { /* sin animación: el círculo queda blanco */ });
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className={className} aria-hidden />;
}
