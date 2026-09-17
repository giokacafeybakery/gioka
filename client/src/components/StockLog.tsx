import { useEffect, useState } from "react";
import { Camera, ImageOff, X, ArrowDownToLine, ArrowUpFromLine, Filter } from "lucide-react";
import { Empty, Loading } from "./ui";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/socket";
import { dateTime, num, ROLE } from "@/lib/format";
import type { Role } from "@/lib/types";

export interface Movement {
  id: number; item_type: "product" | "ingredient"; item_name: string; unit: string; qty: number; reason: string; notes: string;
  photo: string | null; order_number: number | null; user_name: string | null; user_role: Role | null; created_at: string;
}

/** Audit log of stock movements. `manualOnly` hides sales/cancellations (what the admin reviews). */
export function StockLog({ manualOnly = false, limit = 200 }: { manualOnly?: boolean; limit?: number }) {
  const [movs, setMovs] = useState<Movement[] | null>(null);
  const [photo, setPhoto] = useState<Movement | null>(null);
  const [user, setUser] = useState<string>("all");
  const [onlyManual, setOnlyManual] = useState(manualOnly);

  const load = () => api.get<Movement[]>(`/api/inventory/movements?limit=${limit}${onlyManual ? "&manual=1" : ""}`).then(setMovs).catch(() => setMovs([]));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [onlyManual]);
  useSocket({ "stock:updated": () => load(), "order:created": () => load(), "order:updated": () => load() }, [onlyManual]);

  if (!movs) return <Loading />;
  const users = Array.from(new Set(movs.map((m) => m.user_name).filter(Boolean))) as string[];
  const list = movs.filter((m) => user === "all" || m.user_name === user);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button className={`chip ${onlyManual ? "bg-ink text-white" : "bg-paper border border-line text-ink-3"}`} onClick={() => setOnlyManual(!onlyManual)}><Filter size={13} /> Solo ajustes manuales</button>
        {users.length > 1 && (
          <select className="input h-9 w-auto" value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="all">Todos los usuarios</option>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        <span className="text-xs font-bold text-muted ml-auto">{list.length} movimientos</span>
      </div>

      {list.length === 0 ? <Empty title="Sin movimientos" hint="Aquí aparecerán las entradas y salidas de stock con su comprobante." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-cream text-[11px] uppercase tracking-wider text-muted font-extrabold">
              <tr><th className="text-left px-4 py-3">Fecha y hora</th><th className="text-left px-4 py-3">Ítem</th><th className="text-right px-4 py-3">Cantidad</th><th className="text-left px-4 py-3">Motivo</th><th className="text-left px-4 py-3">Usuario</th><th className="text-left px-4 py-3">Comprobante</th></tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="border-t border-line hover:bg-cream/50">
                  <td className="px-4 py-2 font-bold text-muted whitespace-nowrap">{dateTime(m.created_at)}</td>
                  <td className="px-4 py-2"><div className="font-extrabold">{m.item_name}</div><div className="text-[11px] font-bold text-muted">{m.item_type === "product" ? "producto" : "insumo"}</div></td>
                  <td className={`px-4 py-2 text-right font-black whitespace-nowrap ${m.qty < 0 ? "text-berry" : "text-mint-2"}`}>
                    <span className="inline-flex items-center gap-1">{m.qty < 0 ? <ArrowUpFromLine size={13} /> : <ArrowDownToLine size={13} />}{m.qty > 0 ? "+" : ""}{num(m.qty, 3)} {m.unit}</span>
                  </td>
                  <td className="px-4 py-2"><div className="font-semibold capitalize">{m.reason}{m.order_number && <span className="text-muted"> · pedido #{m.order_number}</span>}</div>{m.notes && <div className="text-xs text-muted font-semibold max-w-xs truncate" title={m.notes}>{m.notes}</div>}</td>
                  <td className="px-4 py-2"><div className="font-bold">{m.user_name || "—"}</div>{m.user_role && <div className="text-[11px] font-bold text-muted">{ROLE[m.user_role]}</div>}</td>
                  <td className="px-4 py-2">
                    {m.photo ? (
                      <button onClick={() => setPhoto(m)} className="group relative w-14 h-14 rounded-xl overflow-hidden border border-line hover:ring-2 hover:ring-peach" title="Ver comprobante">
                        <img src={m.photo} alt="" className="w-full h-full object-cover" /><span className="absolute inset-0 grid place-items-center bg-ink/0 group-hover:bg-ink/30 text-white opacity-0 group-hover:opacity-100 transition"><Camera size={18} /></span>
                      </button>
                    ) : m.order_number ? <span className="text-xs font-bold text-muted">—</span> : <span className="pill bg-cream-2 text-muted"><ImageOff size={11} /> Sin foto</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {photo && (
        <div className="fixed inset-0 z-[70] bg-ink/85 flex flex-col items-center justify-center p-4 anim-pop" onClick={() => setPhoto(null)}>
          <button className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20" aria-label="Cerrar"><X size={22} /></button>
          <img src={photo.photo!} alt="Comprobante" className="max-h-[78vh] max-w-full rounded-2xl shadow-pop" onClick={(e) => e.stopPropagation()} />
          <div className="mt-4 text-white text-center">
            <div className="font-black text-lg">{photo.item_name} · <span className={photo.qty < 0 ? "text-[#ff8a8e]" : "text-[#7fe0b6]"}>{photo.qty > 0 ? "+" : ""}{num(photo.qty, 3)} {photo.unit}</span></div>
            <div className="text-sm font-semibold text-white/70">{dateTime(photo.created_at)} · {photo.user_name} · <span className="capitalize">{photo.reason}</span>{photo.notes && ` · ${photo.notes}`}</div>
          </div>
        </div>
      )}
    </div>
  );
}
