import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { TrendingUp, TrendingDown, Receipt, Coins, PiggyBank, AlertTriangle, Clock, Download, Ban, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Loading, Empty, Segmented } from "@/components/ui";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/socket";
import { money, num, todayISO, daysAgoISO, PAYMENT, TYPE } from "@/lib/format";
import type { ReportSummary } from "@/lib/types";
import { toast } from "@/store/toast";

// Validated categorical palette (dataviz validator: all checks pass, light mode). Fixed order, never cycled.
const CAT = ["#e0702f", "#2b7fb8", "#b8860b", "#7d55d6", "#2a8f68"];
const PAY_COLOR: Record<string, string> = { cash: CAT[0], card: CAT[1], qr: CAT[2], unpaid: "#8a8580" };
type Range = "today" | "7d" | "30d" | "month" | "custom";

const ChartTip = ({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string; fmt: (v: number) => string }) =>
  active && payload?.length ? (
    <div className="card px-3 py-2 text-xs shadow-lift"><div className="font-extrabold text-muted mb-1">{label}</div>{payload.map((p) => <div key={p.name} className="font-bold flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.name}: <span className="text-ink font-black">{fmt(p.value)}</span></div>)}</div>
  ) : null;

export default function Reportes() {
  const [range, setRange] = useState<Range>("7d");
  const [from, setFrom] = useState(daysAgoISO(6));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<ReportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = todayISO();
    if (range === "today") { setFrom(t); setTo(t); }
    else if (range === "7d") { setFrom(daysAgoISO(6)); setTo(t); }
    else if (range === "30d") { setFrom(daysAgoISO(29)); setTo(t); }
    else if (range === "month") { setFrom(t.slice(0, 8) + "01"); setTo(t); }
  }, [range]);

  const load = () => { setBusy(true); api.get<ReportSummary>(`/api/reports/summary?from=${from}&to=${to}`).then(setData).catch((e) => toast.error(e.message)).finally(() => setBusy(false)); };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);
  useSocket({ "order:created": () => load(), "order:updated": () => load() }, [from, to]);

  const series = useMemo(() => (data?.series || []).map((d) => ({ ...d, label: new Date(d.day + "T00:00:00").toLocaleDateString("es", { day: "2-digit", month: "short" }), profit: d.revenue - d.cost })), [data]);
  const hourly = useMemo(() => { const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, label: `${String(i).padStart(2, "0")}h`, orders: 0, revenue: 0 })); for (const x of data?.hourly || []) h[x.hour] = { ...h[x.hour], ...x }; return h.filter((x) => x.hour >= 6 && x.hour <= 23); }, [data]);
  const maxCat = Math.max(1, ...(data?.categories || []).map((c) => c.revenue));
  const maxProd = Math.max(1, ...(data?.topProducts || []).map((c) => c.qty));

  const exportCsv = () => {
    if (!data) return;
    const rows = [["Día", "Pedidos", "Ingresos", "Costo", "Ganancia"], ...series.map((d) => [d.day, d.orders, d.revenue.toFixed(2), d.cost.toFixed(2), d.profit.toFixed(2)])];
    const blob = new Blob(["﻿" + rows.map((r) => r.join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `gioka-ventas-${from}_${to}.csv`; a.click();
  };

  const k = data?.kpis;
  const Delta = ({ v }: { v: number }) => <span className={`inline-flex items-center gap-0.5 text-xs font-black ${v >= 0 ? "text-mint-2" : "text-berry"}`}>{v >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{v >= 0 ? "+" : ""}{num(v, 0)}%</span>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader title="Reportes" subtitle={data ? `${data.range.from} → ${data.range.to} · ${data.range.days} día${data.range.days > 1 ? "s" : ""}` : "Ventas, ganancias y stock"}>
        <button className="btn-icon btn-ghost" onClick={load} title="Actualizar"><RefreshCw size={18} className={busy ? "animate-spin" : ""} /></button>
        <button className="btn-soft btn-sm" onClick={exportCsv} disabled={!data}><Download size={15} /> CSV</button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={range} onChange={setRange} options={[{ value: "today", label: "Hoy" }, { value: "7d", label: "7 días" }, { value: "30d", label: "30 días" }, { value: "month", label: "Este mes" }, { value: "custom", label: "Rango" }]} />
          {range === "custom" && <div className="flex items-center gap-2"><input type="date" className="input h-9 w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><span className="text-muted font-bold">→</span><input type="date" className="input h-9 w-auto" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)} /></div>}
        </div>

        {!data || !k ? <Loading /> : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="card p-4 bg-ink text-white border-0">
                <div className="flex items-center justify-between"><span className="text-[12px] font-extrabold uppercase tracking-wider text-white/60">Ingresos</span><Coins size={18} className="text-peach" /></div>
                <div className="text-3xl font-black tracking-tight mt-1">{money(k.revenue)}</div>
                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-white/60"><Delta v={k.revenue_change} /> vs período anterior</div>
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between"><span className="text-[12px] font-extrabold uppercase tracking-wider text-muted">Ganancia</span><PiggyBank size={18} className="text-mint-2" /></div>
                <div className="text-3xl font-black tracking-tight mt-1">{money(k.profit)}</div>
                <div className="mt-1 text-xs font-bold text-muted">Margen {num(k.margin, 1)}% · costo {money(k.cost)}</div>
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between"><span className="text-[12px] font-extrabold uppercase tracking-wider text-muted">Pedidos</span><Receipt size={18} className="text-sky" /></div>
                <div className="text-3xl font-black tracking-tight mt-1">{num(k.orders)}</div>
                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-muted"><Delta v={k.orders_change} /> · {num(k.items)} artículos</div>
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between"><span className="text-[12px] font-extrabold uppercase tracking-wider text-muted">Ticket promedio</span><Clock size={18} className="text-lilac" /></div>
                <div className="text-3xl font-black tracking-tight mt-1">{money(k.avg_ticket)}</div>
                <div className="mt-1 text-xs font-bold text-muted">Preparación {num(k.avg_prep_minutes, 0)} min prom.</div>
              </div>
            </div>

            {(k.unpaid_orders > 0 || k.cancelled > 0 || data.lowStock.products.length + data.lowStock.ingredients.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {k.unpaid_orders > 0 && <span className="chip bg-berry-soft text-berry"><Receipt size={14} /> {k.unpaid_orders} pedidos sin cobrar · {money(k.unpaid_total)}</span>}
                {k.cancelled > 0 && <span className="chip bg-cream-2 text-ink-3"><Ban size={14} /> {k.cancelled} cancelados</span>}
                {data.lowStock.products.length + data.lowStock.ingredients.length > 0 && <span className="chip bg-butter-soft text-[#9a6b00]"><AlertTriangle size={14} /> {data.lowStock.products.length + data.lowStock.ingredients.length} productos en falta</span>}
              </div>
            )}

            {/* Revenue by day */}
            <section className="card p-4 md:p-5">
              <div className="flex items-center justify-between mb-1"><h3 className="font-black text-[16px]">Ingresos y ganancia por día</h3><div className="flex gap-3 text-xs font-bold text-muted"><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CAT[0] }} /> Ingresos</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CAT[4] }} /> Ganancia</span></div></div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#ece5db" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: "#8a8580" }} axisLine={false} tickLine={false} interval={series.length > 14 ? Math.ceil(series.length / 10) : 0} />
                    <YAxis tick={{ fontSize: 11, fontWeight: 700, fill: "#8a8580" }} axisLine={false} tickLine={false} tickFormatter={(v) => num(v)} />
                    <Tooltip cursor={{ fill: "#f4efe8" }} content={<ChartTip fmt={(v) => money(v)} />} />
                    <Bar dataKey="revenue" name="Ingresos" fill={CAT[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="profit" name="Ganancia" fill={CAT[4]} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Hourly */}
              <section className="card p-4 md:p-5">
                <h3 className="font-black text-[16px] mb-1">Pedidos por hora</h3>
                <p className="text-xs font-bold text-muted mb-2">Identifica tus horas pico para organizar al equipo</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourly} barCategoryGap="22%" margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#ece5db" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700, fill: "#8a8580" }} axisLine={false} tickLine={false} interval={1} />
                      <YAxis tick={{ fontSize: 11, fontWeight: 700, fill: "#8a8580" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip cursor={{ fill: "#f4efe8" }} content={<ChartTip fmt={(v) => `${num(v)} pedidos`} />} />
                      <Bar dataKey="orders" name="Pedidos" radius={[4, 4, 0, 0]} maxBarSize={28}>
                        {hourly.map((h) => <Cell key={h.hour} fill={h.orders === Math.max(...hourly.map((x) => x.orders)) && h.orders > 0 ? CAT[0] : "#d9c9bb"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Payments & types */}
              <section className="card p-4 md:p-5">
                <h3 className="font-black text-[16px] mb-3">Métodos de pago</h3>
                {data.payments.length === 0 ? <Empty title="Sin ventas en el período" /> : (
                  <div className="space-y-2.5">
                    {data.payments.map((p) => { const pct = k.revenue ? (p.revenue / k.revenue) * 100 : 0; return (
                      <div key={p.method}>
                        <div className="flex justify-between text-sm font-bold"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PAY_COLOR[p.method] }} />{p.method === "unpaid" ? "Sin cobrar" : PAYMENT[p.method as keyof typeof PAYMENT]}<span className="text-muted">· {p.orders}</span></span><span className="font-black">{money(p.revenue)} <span className="text-muted font-bold text-xs">{num(pct)}%</span></span></div>
                        <div className="h-2 rounded-full bg-cream-2 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: PAY_COLOR[p.method] }} /></div>
                      </div>); })}
                  </div>
                )}
                <h3 className="font-black text-[16px] mt-5 mb-2">Tipo de pedido</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(["takeaway", "dinein", "delivery"] as const).map((t) => { const x = data.types.find((y) => y.type === t); return (
                    <div key={t} className="rounded-xl bg-cream p-3"><div className="text-[11px] font-extrabold uppercase text-muted">{TYPE[t].label}</div><div className="text-xl font-black">{x?.orders || 0}</div><div className="text-xs font-bold text-muted">{money(x?.revenue || 0)}</div></div>); })}
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Top products */}
              <section className="card p-4 md:p-5">
                <h3 className="font-black text-[16px] mb-3">Productos más vendidos</h3>
                {data.topProducts.length === 0 ? <Empty title="Sin ventas" /> : (
                  <ol className="space-y-2">
                    {data.topProducts.map((p, i) => (
                      <li key={p.name} className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-lg grid place-items-center text-xs font-black ${i < 3 ? "bg-peach text-white" : "bg-cream text-muted"}`}>{i + 1}</span>
                        <span className="text-xl w-7 text-center">{p.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm"><span className="font-extrabold truncate">{p.name}</span><span className="font-black shrink-0">{num(p.qty)} <span className="text-muted font-bold text-xs">u.</span></span></div>
                          <div className="flex items-center gap-2 mt-1"><div className="h-1.5 flex-1 rounded-full bg-cream-2 overflow-hidden"><div className="h-full rounded-full bg-peach" style={{ width: `${(p.qty / maxProd) * 100}%` }} /></div><span className="text-[11px] font-bold text-muted w-20 text-right">{money(p.revenue)}</span></div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Categories + low stock */}
              <div className="space-y-4">
                <section className="card p-4 md:p-5">
                  <h3 className="font-black text-[16px] mb-3">Ventas por categoría</h3>
                  {data.categories.length === 0 ? <Empty title="Sin ventas" /> : (
                    <div className="space-y-2">
                      {data.categories.map((c) => (
                        <div key={c.name} className="flex items-center gap-3 text-sm">
                          <span className="w-28 font-extrabold truncate">{c.name}</span>
                          <div className="flex-1 h-5 rounded-md bg-cream-2 overflow-hidden"><div className="h-full rounded-md" style={{ width: `${(c.revenue / maxCat) * 100}%`, background: c.color }} /></div>
                          <span className="w-20 text-right font-black">{money(c.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="card p-4 md:p-5">
                  <h3 className="font-black text-[16px] mb-1 flex items-center gap-2"><AlertTriangle size={18} className="text-butter" /> Productos en falta</h3>
                  <p className="text-xs font-bold text-muted mb-3">Stock igual o por debajo del mínimo</p>
                  {data.lowStock.products.length + data.lowStock.ingredients.length === 0 ? <div className="text-sm font-bold text-mint-2">✅ Todo el stock está en orden</div> : (
                    <ul className="divide-y divide-line">
                      {data.lowStock.products.map((p) => <li key={"p" + p.id} className="py-2 flex items-center gap-3 text-sm"><span className="text-lg">{p.emoji}</span><span className="font-extrabold flex-1">{p.name}<span className="text-xs text-muted font-bold"> · producto</span></span><span className={`pill ${p.stock <= 0 ? "bg-berry text-white" : "bg-butter-soft text-[#9a6b00]"}`}>{num(p.stock, 1)} / mín {num(p.min_stock, 1)}</span></li>)}
                      {data.lowStock.ingredients.map((i) => <li key={"i" + i.id} className="py-2 flex items-center gap-3 text-sm"><span className="text-lg">📦</span><span className="font-extrabold flex-1">{i.name}<span className="text-xs text-muted font-bold"> · {i.supplier || "insumo"}</span></span><span className={`pill ${i.stock <= 0 ? "bg-berry text-white" : "bg-butter-soft text-[#9a6b00]"}`}>{num(i.stock, 2)} / mín {num(i.min_stock, 2)} {i.unit}</span></li>)}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
