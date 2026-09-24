import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { Modal } from "./ui";
import { toast } from "@/store/toast";

/** Destino del acceso directo de Chrome que imprime sin diálogo. */
export const KIOSK_TARGET = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing';

/* ------------------------------------------------------------------ piezas de las maquetas
 * Son recreaciones de las ventanas de Windows, no capturas: se ven nítidas en cualquier pantalla,
 * no pesan nada y hablan el mismo idioma que la app.
 */

const Cursor = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={`absolute w-5 h-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${className}`} aria-hidden>
    <path d="M3 1.5 L3 15.5 L6.7 12 L9 17 L11.4 15.9 L9.2 11.2 L14.5 11 Z" fill="#fff" stroke="#1a1a1a" strokeWidth="1.1" strokeLinejoin="round" />
  </svg>
);

/** Ventana de Windows 11: barra de título clara y controles a la derecha. */
const Win = ({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) => (
  <div className={`relative rounded-lg bg-white border border-black/10 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)] overflow-hidden ${className}`}>
    <div className="h-6 px-2.5 flex items-center bg-[#f3f3f3] border-b border-black/5">
      <span className="text-[9px] font-semibold text-black/60 truncate">{title}</span>
      <span className="ml-auto flex items-center gap-2 text-black/45 text-[9px] leading-none"><span>─</span><span>▢</span><span>✕</span></span>
    </div>
    {children}
  </div>
);

/** Recuadro naranja que señala dónde hay que tocar. */
const Spot = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`relative inline-flex rounded-md ring-2 ring-peach ring-offset-1 ring-offset-white ${className}`}>{children}</span>
);

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="relative aspect-[16/9] w-full rounded-2xl bg-gradient-to-br from-[#e9eef5] to-[#d7dfea] grid place-items-center overflow-hidden">
    {children}
  </div>
);

/* Paso 1 — la térmica como impresora predeterminada */
const StepPrinter = () => (
  <Frame>
    <Win title="Configuración · Impresoras y escáneres" className="w-[92%]">
      <div className="flex">
        <div className="w-[28%] p-2 space-y-1 bg-[#fafafa] border-r border-black/5">
          {["Sistema", "Bluetooth y dispositivos", "Red", "Cuentas"].map((x, i) => (
            <div key={x} className={`text-[8px] px-1.5 py-1 rounded truncate ${i === 1 ? "bg-black/[0.06] font-bold text-black/75" : "text-black/45"}`}>{x}</div>
          ))}
        </div>
        <div className="flex-1 p-2.5 space-y-1.5">
          <div className="text-[9px] font-bold text-black/75">Impresoras y escáneres</div>
          <div className="rounded-md border border-black/10 p-2 flex items-center gap-2">
            <div className="w-6 h-5 rounded-sm bg-[#d9e4f2] border border-black/10" />
            <div className="flex-1 min-w-0">
              <div className="text-[8.5px] font-bold text-black/75 truncate">POS-80 (térmica)</div>
              <div className="text-[7.5px] text-black/45">Lista</div>
            </div>
            <Spot><span className="block text-[8px] font-bold text-white bg-[#005fb8] rounded px-2 py-1 whitespace-nowrap">Establecer como predeterminada</span></Spot>
          </div>
          <div className="rounded-md border border-black/[0.07] p-2 flex items-center gap-2 opacity-50">
            <div className="w-6 h-5 rounded-sm bg-black/10" />
            <div className="text-[8.5px] text-black/60">Microsoft Print to PDF</div>
          </div>
        </div>
      </div>
      <Cursor className="right-[6%] top-[42%]" />
    </Win>
  </Frame>
);

/* Paso 2 — clic derecho en el acceso directo de Chrome */
const StepShortcut = () => (
  <Frame>
    <div className="relative w-[88%] flex items-start gap-1 py-3">
      <div className="w-20 text-center shrink-0">
        <div className="mx-auto w-11 h-11 rounded-xl bg-white shadow grid place-items-center">
          <span className="w-6 h-6 rounded-full border-[3px] border-[#e34133] border-r-[#f9bc05] border-b-[#34a853]" />
        </div>
        <div className="mt-1 text-[8px] font-semibold text-black/70">Google Chrome</div>
      </div>
      <div className="w-44 rounded-lg bg-white border border-black/10 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)] py-1 mt-10">
        {["Abrir", "Abrir ubicación del archivo", "Anclar a la barra de tareas", "Cambiar nombre"].map((x) => (
          <div key={x} className="px-3 py-1.5 text-[8.5px] text-black/60 truncate">{x}</div>
        ))}
        <div className="h-px bg-black/10 my-1" />
        <div className="px-1.5"><Spot className="w-full"><span className="block w-full px-1.5 py-1.5 text-[9px] font-bold text-black/80 bg-black/[0.06] rounded">Propiedades</span></Spot></div>
      </div>
      <Cursor className="left-[34%] bottom-[8%]" />
    </div>
  </Frame>
);

/* Paso 3 — el campo Destino */
const StepTarget = () => (
  <Frame>
    <Win title="Propiedades de Google Chrome" className="w-[92%]">
      <div className="px-3 pt-2">
        <div className="flex gap-3 border-b border-black/10 text-[8.5px]">
          {["General", "Acceso directo", "Compatibilidad"].map((t, i) => (
            <span key={t} className={`pb-1 ${i === 1 ? "font-bold text-black/80 border-b-2 border-[#005fb8]" : "text-black/40"}`}>{t}</span>
          ))}
        </div>
        <div className="py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-14 text-[8px] text-black/55 text-right shrink-0">Destino:</span>
            <Spot className="flex-1">
              <span className="block w-full rounded border border-black/20 bg-white px-1.5 py-1 font-mono text-[7.5px] leading-relaxed text-black/70 break-all">
                "C:\Program Files\Google\Chrome\Application\chrome.exe"
                <span className="text-peach-2 font-bold"> --kiosk-printing</span>
              </span>
            </Spot>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 text-[8px] text-black/55 text-right shrink-0">Iniciar en:</span>
            <span className="flex-1 rounded border border-black/15 bg-white px-1.5 py-1 font-mono text-[7.5px] text-black/40 truncate">"C:\Program Files\Google\Chrome\Application"</span>
          </div>
        </div>
        <div className="flex justify-end gap-1.5 pb-2.5">
          {["Aceptar", "Cancelar", "Aplicar"].map((b, i) => (
            <span key={b} className={`text-[8px] rounded px-2.5 py-1 border ${i === 0 ? "bg-[#005fb8] text-white border-[#005fb8] font-bold" : "bg-[#fbfbfb] text-black/65 border-black/15"}`}>{b}</span>
          ))}
        </div>
      </div>
      <Cursor className="right-[31%] bottom-[3%]" />
    </Win>
  </Frame>
);

/* Paso 4 — cómo se ve cuando ya funciona */
const StepResult = () => (
  <Frame>
    <div className="w-[92%] flex items-center gap-3">
      <Win title="Gioka · Pedidos" className="flex-1">
        <div className="h-[84px] bg-[#fdfaf6] p-2 flex gap-1.5">
          <div className="w-5 rounded bg-ink/90" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2 w-1/2 rounded bg-black/10" />
            <div className="h-6 rounded bg-white border border-black/10" />
            <div className="h-6 rounded bg-white border border-black/10" />
          </div>
        </div>
      </Win>
      <div className="w-[34%] shrink-0">
        <div className="rounded-lg bg-[#3b3b3b] h-7 grid place-items-center shadow-inner">
          <div className="w-[72%] h-1 rounded bg-black/60" />
        </div>
        <div className="mx-auto w-[72%] bg-white shadow rounded-b px-1.5 py-1.5 space-y-1">
          <div className="text-[7px] font-black text-center text-black/70">COCINA #12</div>
          <div className="h-px bg-black/15" />
          <div className="h-1 w-4/5 rounded bg-black/15" />
          <div className="h-1 w-3/5 rounded bg-black/15" />
          <div className="h-1 w-2/3 rounded bg-black/15" />
        </div>
        <div className="mt-2 flex items-center justify-center gap-1 text-[8px] font-extrabold text-mint-2"><Check size={11} /> Sin diálogo</div>
      </div>
    </div>
  </Frame>
);

interface Step { title: string; body: ReactNode; art: ReactNode }

/** Guía visual: dejar Chrome imprimiendo sin preguntar, paso por paso. */
export function PrintSetupGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);

  const copy = async () => {
    try { await navigator.clipboard.writeText(KIOSK_TARGET); toast.success("Destino copiado"); }
    catch { toast.error("No se pudo copiar", "Escríbelo a mano tal como se ve arriba."); }
  };

  const steps: Step[] = [
    {
      title: "La térmica, como predeterminada",
      body: <>En Windows abre <b>Configuración → Bluetooth y dispositivos → Impresoras y escáneres</b>, entra en tu impresora térmica y toca <b>Establecer como predeterminada</b>. Chrome imprimirá siempre en ella.</>,
      art: <StepPrinter />,
    },
    {
      title: "Propiedades del acceso directo",
      body: <>En el escritorio, <b>clic derecho</b> sobre el ícono de Google Chrome y elige <b>Propiedades</b>. Si no tienes el ícono, arrastra Chrome desde el menú Inicio hasta el escritorio.</>,
      art: <StepShortcut />,
    },
    {
      title: "Agrega --kiosk-printing",
      body: <>En la pestaña <b>Acceso directo</b>, ve al final del campo <b>Destino</b>: después de las comillas deja un espacio y escribe <b>--kiosk-printing</b>. Luego <b>Aplicar</b> y <b>Aceptar</b>.</>,
      art: <StepTarget />,
    },
    {
      title: "Abre Gioka desde ese acceso directo",
      body: <>Cierra Chrome por completo y vuelve a abrirlo con ese ícono. Entra a Gioka, activa la estación y manda la <b>comanda de prueba</b>: debe salir sola, sin la ventana de impresión.</>,
      art: <StepResult />,
    },
  ];
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <Modal open={open} onClose={onClose} width="max-w-lg"
      title="Imprimir sin el diálogo de Windows"
      subtitle={`Paso ${i + 1} de ${steps.length} · se hace una sola vez en esta computadora`}
      footer={
        <div className="flex items-center gap-2 w-full">
          <button className="btn-ghost" onClick={() => (i ? setI(i - 1) : onClose())}>{i ? <><ChevronLeft size={18} /> Anterior</> : "Cerrar"}</button>
          <div className="flex-1 flex justify-center gap-1.5">
            {steps.map((_, n) => (
              <button key={n} onClick={() => setI(n)} aria-label={`Paso ${n + 1}`}
                className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-peach" : "w-1.5 bg-line hover:bg-muted/40"}`} />
            ))}
          </div>
          <button className="btn-primary" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? "Listo" : "Siguiente"}{!last && <ChevronRight size={18} />}</button>
        </div>
      }>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={i} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.18 }}>
          {step.art}
          <h4 className="mt-4 text-base font-black tracking-tight">{step.title}</h4>
          <p className="mt-1 text-sm font-semibold text-muted leading-relaxed">{step.body}</p>
          {i === 2 && <button className="btn-soft btn-sm mt-3" onClick={copy}><Copy size={15} /> Copiar el destino completo</button>}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
