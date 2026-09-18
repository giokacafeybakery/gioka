import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, ImagePlus, X, Printer, Store, Users, Tags, Package, Save, Wifi, Globe, CheckCircle2, EyeOff, ClipboardList, Send, KeyRound, Hash, Eye } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Modal, Field, Segmented, Empty, Loading, ProductThumb, Toggle, Confirm } from "@/components/ui";
import { api } from "@/lib/api";
import { money, ROLE } from "@/lib/format";
import type { Category, Ingredient, Product, Settings, User, Role } from "@/lib/types";
import { useSettings } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";
import { StockLog } from "@/components/StockLog";

type Tab = "products" | "categories" | "stock" | "users" | "settings";
const EMOJIS = ["☕", "🍵", "🧋", "🥤", "🧃", "🍹", "🍦", "🍨", "🍧", "🍰", "🧁", "🍩", "🍪", "🍫", "🍓", "🍌", "🥐", "🥖", "🥯", "🍞", "🥧", "🥪", "🥑", "🧀", "🍕", "🌮", "🥗", "🍳", "💧", "🫖", "🍽️", "🐼"];

export default function Admin() {
  const [tab, setTab] = useState<Tab>("products");
  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader title="Administración" subtitle="Productos, categorías, equipo y ajustes del negocio">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "products", label: <span className="flex items-center gap-1.5"><Package size={15} /> Productos</span> },
          { value: "categories", label: <span className="flex items-center gap-1.5"><Tags size={15} /> Categorías</span> },
          { value: "stock", label: <span className="flex items-center gap-1.5"><ClipboardList size={15} /> Ajustes de stock</span> },
          { value: "users", label: <span className="flex items-center gap-1.5"><Users size={15} /> Equipo</span> },
          { value: "settings", label: <span className="flex items-center gap-1.5"><Store size={15} /> Ajustes</span> },
        ]} />
      </PageHeader>
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6">
        {tab === "products" && <Products />}
        {tab === "categories" && <Categories />}
        {tab === "stock" && (
          <div>
            <p className="text-sm font-semibold text-muted mb-3">Entradas y salidas registradas manualmente por el gestor de inventario y administradores, con foto del comprobante, hora, usuario y motivo.</p>
            <StockLog manualOnly />
          </div>
        )}
        {tab === "users" && <UsersTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

/* ---------------- Products ---------------- */
function Products() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [edit, setEdit] = useState<(Partial<Product> & { image?: string | null }) | null>(null);
  const [del, setDel] = useState<Product | null>(null);
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => Promise.all([
    api.get<Product[]>("/api/products?all=1").then(setProducts),
    api.get<Category[]>("/api/categories").then(setCats),
    api.get<Ingredient[]>("/api/inventory/ingredients").then(setIngs),
  ]).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  const pick = (f: File | undefined) => {
    if (!f || !edit) return;
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 800; const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = img.width * sc; c.height = img.height * sc;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      setEdit((e) => e && { ...e, image: c.toDataURL("image/jpeg", 0.85) }); URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  const save = async () => {
    if (!edit?.name || edit.price == null) return toast.warning("Nombre y precio son requeridos");
    try {
      if (edit.id) await api.put(`/api/products/${edit.id}`, edit); else await api.post("/api/products", edit);
      toast.success("Producto guardado"); setEdit(null); load();
    } catch (e) { toast.error((e as Error).message); }
  };
  const s = q.trim().toLowerCase();
  const list = (products || []).filter((p) => !s || p.name.toLowerCase().includes(s) || (p.category_name || "").toLowerCase().includes(s));

  if (!products) return <Loading />;
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input className="input h-10 max-w-xs" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary ml-auto" onClick={() => setEdit({ name: "", description: "", price: 0, cost: 0, emoji: "🍽️", category_id: cats[0]?.id ?? null, active: true, track_stock: false, stock: 0, min_stock: 5, recipe: [] })}><Plus size={18} /> Producto</button>
      </div>
      {list.length === 0 ? <Empty title="Sin productos" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-cream text-[11px] uppercase tracking-wider text-muted font-extrabold"><tr><th className="text-left px-4 py-3">Producto</th><th className="text-left px-4 py-3">Categoría</th><th className="text-right px-4 py-3">Precio</th><th className="text-right px-4 py-3">Costo</th><th className="text-right px-4 py-3">Margen</th><th className="text-left px-4 py-3">Stock</th><th className="text-left px-4 py-3">Estado</th><th className="px-2 py-3" /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={`border-t border-line hover:bg-cream/60 ${!p.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2"><div className="flex items-center gap-3"><ProductThumb emoji={p.emoji} image={p.image} color={p.category_color} size={44} rounded="rounded-xl" /><div><div className="font-extrabold">{p.name}</div><div className="text-xs text-muted font-semibold truncate max-w-xs">{p.description}</div></div></div></td>
                  <td className="px-4 py-2"><span className="chip h-7 text-xs" style={{ background: `${p.category_color || "#ccc"}33`, color: "#3a3a3a" }}>{p.category_emoji} {p.category_name || "—"}</span></td>
                  <td className="px-4 py-2 text-right font-black">{money(p.price)}</td>
                  <td className="px-4 py-2 text-right font-bold text-muted">{money(p.cost)}</td>
                  <td className="px-4 py-2 text-right font-bold text-mint-2">{p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0}%</td>
                  <td className="px-4 py-2 font-bold">{p.track_stock ? <span className={p.stock <= p.min_stock ? "text-berry" : ""}>{p.stock} u</span> : <span className="text-muted">{p.recipe.length ? `${p.recipe.length} insumos` : "—"}</span>}</td>
                  <td className="px-4 py-2">{p.active ? <span className="pill bg-mint-soft text-mint-2"><CheckCircle2 size={11} /> Activo</span> : <span className="pill bg-cream-2 text-muted"><EyeOff size={11} /> Oculto</span>}</td>
                  <td className="px-2 py-2"><div className="flex justify-end gap-1"><button className="btn-icon btn-ghost w-9 h-9" onClick={() => setEdit({ ...p })}><Pencil size={15} /></button><button className="btn-icon btn-ghost w-9 h-9 text-berry" onClick={() => setDel(p)}><Trash2 size={15} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Editar producto" : "Nuevo producto"} width="max-w-2xl"
        footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary" onClick={save}><Save size={18} /> Guardar</button></>}>
        {edit && (
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5">
            <div>
              <label className="label">Imagen</label>
              <div className="relative">
                {edit.image ? <img src={edit.image} alt="" className="w-full aspect-square object-cover rounded-2xl" /> : (
                  <div className="w-full aspect-square rounded-2xl grid place-items-center text-7xl" style={{ background: `linear-gradient(145deg, ${cats.find((c) => c.id === edit.category_id)?.color || "#F2915A"}2e, ${cats.find((c) => c.id === edit.category_id)?.color || "#F2915A"}66)` }}>{edit.emoji}</div>
                )}
                {edit.image && <button className="absolute top-2 right-2 w-8 h-8 rounded-full bg-ink/70 text-white grid place-items-center" onClick={() => setEdit({ ...edit, image: null })}><X size={14} /></button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              <button className="btn-soft btn-sm w-full mt-2" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> Subir foto</button>
              <label className="label mt-3">Emoji</label>
              <div className="flex flex-wrap gap-1">{EMOJIS.map((e) => <button key={e} onClick={() => setEdit({ ...edit, emoji: e })} className={`w-8 h-8 rounded-lg text-lg grid place-items-center ${edit.emoji === e ? "bg-peach-soft ring-2 ring-peach" : "hover:bg-cream"}`}>{e}</button>)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 content-start">
              <Field label="Nombre" className="col-span-2"><input autoFocus className="input" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Descripción" className="col-span-2"><input className="input" value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <Field label="Categoría" className="col-span-2"><select className="input" value={edit.category_id ?? ""} onChange={(e) => setEdit({ ...edit, category_id: e.target.value ? Number(e.target.value) : null })}><option value="">Sin categoría</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</select></Field>
              <Field label="Precio de venta"><input className="input" type="number" step="0.01" min={0} value={edit.price ?? 0} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></Field>
              <Field label="Costo" hint="Para calcular ganancias"><input className="input" type="number" step="0.01" min={0} value={edit.cost ?? 0} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} /></Field>
              <div className="col-span-2 flex flex-wrap gap-5 py-1">
                <Toggle checked={!!edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Visible en el menú" />
                <Toggle checked={!!edit.track_stock} onChange={(v) => setEdit({ ...edit, track_stock: v })} label="Controlar stock por unidad" />
              </div>
              {edit.track_stock && (<>
                <Field label="Stock actual"><input className="input" type="number" step="any" value={edit.stock ?? 0} onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })} /></Field>
                <Field label="Stock mínimo"><input className="input" type="number" step="any" value={edit.min_stock ?? 0} onChange={(e) => setEdit({ ...edit, min_stock: Number(e.target.value) })} /></Field>
              </>)}
              <div className="col-span-2">
                <label className="label">Receta (insumos que descuenta cada venta)</label>
                <div className="space-y-2">
                  {(edit.recipe || []).map((r, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select className="input h-10 flex-1" value={r.ingredient_id} onChange={(e) => { const recipe = [...(edit.recipe || [])]; recipe[i] = { ...recipe[i], ingredient_id: Number(e.target.value) }; setEdit({ ...edit, recipe }); }}>
                        {ings.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}
                      </select>
                      <input className="input h-10 w-28" type="number" step="any" min={0} value={r.qty} onChange={(e) => { const recipe = [...(edit.recipe || [])]; recipe[i] = { ...recipe[i], qty: Number(e.target.value) }; setEdit({ ...edit, recipe }); }} />
                      <button className="btn-icon btn-ghost w-9 h-9 text-berry" onClick={() => setEdit({ ...edit, recipe: (edit.recipe || []).filter((_, j) => j !== i) })}><X size={15} /></button>
                    </div>
                  ))}
                  <button className="btn-soft btn-sm" disabled={!ings.length} onClick={() => setEdit({ ...edit, recipe: [...(edit.recipe || []), { ingredient_id: ings[0].id, qty: 1 }] })}><Plus size={14} /> Agregar insumo</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Ocultar" title={del ? `¿Ocultar ${del.name}?` : ""} message="El producto dejará de mostrarse en el menú. Podrás reactivarlo editándolo." onConfirm={async () => { if (!del) return; await api.delete(`/api/products/${del.id}`); toast.success("Producto oculto"); load(); }} />
    </div>
  );
}

/* ---------------- Categories ---------------- */
const COLORS = ["#C98B5E", "#F5A3B5", "#F2B84B", "#B48CF2", "#6CC5E8", "#7ED0A5", "#F2915A", "#E5484D", "#8a8580"];
function Categories() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const load = () => api.get<Category[]>("/api/categories").then(setCats);
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!edit?.name) return toast.warning("Nombre requerido");
    try { if (edit.id) await api.put(`/api/categories/${edit.id}`, edit); else await api.post("/api/categories", edit); setEdit(null); load(); toast.success("Categoría guardada"); }
    catch (e) { toast.error((e as Error).message); }
  };
  if (!cats) return <Loading />;
  return (
    <div>
      <div className="flex justify-end mb-4"><button className="btn-primary" onClick={() => setEdit({ name: "", emoji: "🍽️", color: COLORS[0] })}><Plus size={18} /> Categoría</button></div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {cats.map((c) => (
          <div key={c.id} className="card p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl grid place-items-center text-2xl" style={{ background: `${c.color}33` }}>{c.emoji}</div>
            <div className="flex-1 min-w-0"><div className="font-extrabold truncate">{c.name}</div><div className="text-xs font-bold text-muted">Orden {c.sort}</div></div>
            <button className="btn-icon btn-ghost w-9 h-9" onClick={() => setEdit({ ...c })}><Pencil size={15} /></button>
            <button className="btn-icon btn-ghost w-9 h-9 text-berry" onClick={() => setDel(c)}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Editar categoría" : "Nueva categoría"} width="max-w-sm"
        footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary" onClick={save}>Guardar</button></>}>
        {edit && (
          <div className="space-y-3">
            <Field label="Nombre"><input autoFocus className="input" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emoji"><input className="input text-center text-xl" value={edit.emoji || ""} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} /></Field>
              <Field label="Orden"><input className="input" type="number" value={edit.sort ?? 0} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></Field>
            </div>
            <div><label className="label">Color</label><div className="flex flex-wrap gap-2">{COLORS.map((c) => <button key={c} onClick={() => setEdit({ ...edit, color: c })} className={`w-9 h-9 rounded-full ${edit.color === c ? "ring-4 ring-offset-2 ring-ink/20" : ""}`} style={{ background: c }} />)}</div></div>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Eliminar" title={del ? `¿Eliminar ${del.name}?` : ""} message="Los productos de esta categoría quedarán sin categoría." onConfirm={async () => { if (!del) return; await api.delete(`/api/categories/${del.id}`); load(); }} />
    </div>
  );
}

/* ---------------- Users ---------------- */
function UsersTab() {
  const me = useAuth((s) => s.user);
  const [users, setUsers] = useState<User[] | null>(null);
  const [edit, setEdit] = useState<(Partial<User> & { password?: string }) | null>(null);
  const [del, setDel] = useState<User | null>(null);
  const load = () => api.get<User[]>("/api/auth/users").then(setUsers);
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!edit?.name) return toast.warning("Nombre requerido");
    if (!edit.email) return toast.warning("Correo requerido");
    if (!edit.id && !(edit.password && edit.password.length >= 6)) return toast.warning("La contraseña debe tener al menos 6 caracteres");
    const body = { ...edit, password: edit.password || undefined };
    try { if (edit.id) await api.put(`/api/auth/users/${edit.id}`, body); else await api.post("/api/auth/users", body); setEdit(null); load(); toast.success("Usuario guardado"); }
    catch (e) { toast.error((e as Error).message); }
  };
  if (!users) return <Loading />;
  return (
    <div>
      <div className="flex justify-end mb-4"><button className="btn-primary" onClick={() => setEdit({ name: "", email: "", role: "cajero", password: "" })}><Plus size={18} /> Usuario</button></div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {users.map((u) => (
          <div key={u.id} className={`card p-4 flex items-center gap-3 ${!u.active ? "opacity-50" : ""}`}>
            <div className="w-12 h-12 rounded-full bg-peach-soft text-peach-2 font-black text-lg grid place-items-center">{u.name[0]}</div>
            <div className="flex-1 min-w-0"><div className="font-extrabold truncate">{u.name} {u.id === me?.id && <span className="text-xs text-muted">(tú)</span>}</div><div className="text-xs font-bold text-muted truncate">{ROLE[u.role]} · {u.email}{!u.active && " · inactivo"}</div></div>
            <button className="btn-icon btn-ghost w-9 h-9" onClick={() => setEdit({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, password: "" })}><Pencil size={15} /></button>
            {u.id !== me?.id && !!u.active && <button className="btn-icon btn-ghost w-9 h-9 text-berry" onClick={() => setDel(u)}><Trash2 size={15} /></button>}
          </div>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Editar usuario" : "Nuevo usuario"} width="max-w-sm"
        footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary" onClick={save}>Guardar</button></>}>
        {edit && (
          <div className="space-y-3">
            <Field label="Nombre"><input autoFocus className="input" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Rol"><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>{(Object.keys(ROLE) as Role[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select></Field>
            <Field label="Correo"><input className="input" type="email" autoComplete="off" value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label={edit.id ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña (mín. 6 caracteres)"}><input className="input" type="password" autoComplete="new-password" value={edit.password || ""} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
            {edit.id && <Toggle checked={!!edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Usuario activo" />}
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Desactivar" title={del ? `¿Desactivar a ${del.name}?` : ""} message="No podrá iniciar sesión hasta que lo reactives." onConfirm={async () => { if (!del) return; await api.delete(`/api/auth/users/${del.id}`); load(); }} />
    </div>
  );
}

/* ---------------- Settings ---------------- */
function SettingsTab() {
  const { settings, load, save } = useSettings();
  const [form, setForm] = useState<Partial<Settings> | null>(null);
  const [busy, setBusy] = useState(false);
  const [tg, setTg] = useState<{ busy: boolean; ok?: { bot: string; chat: string }; showToken: boolean }>({ busy: false, showToken: false });
  useEffect(() => { load().then(() => setForm(useSettings.getState().settings)); }, [load]);
  if (!form || !settings) return <Loading />;
  const f = <K extends keyof Settings>(k: K) => ({ value: (form[k] ?? "") as string | number, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }) });
  const doSave = async () => { setBusy(true); try { await save(form); toast.success("Ajustes guardados"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const test = async () => { try { await save(form); await api.post("/api/print/test"); toast.success("Página de prueba enviada"); } catch (e) { toast.error("Impresora", (e as Error).message); } };
  const tgConfigured = !!(form.telegram_bot_token?.trim() && form.telegram_chat_id?.trim());
  const testTelegram = async () => {
    setTg((t) => ({ ...t, busy: true, ok: undefined }));
    try {
      await save(form);
      const ok = await api.post<{ bot: string; chat: string }>("/api/settings/telegram/test", { telegram_bot_token: form.telegram_bot_token, telegram_chat_id: form.telegram_chat_id });
      setTg((t) => ({ ...t, busy: false, ok }));
      toast.success("Telegram conectado", `Mensaje de prueba enviado a ${ok.chat}`);
    } catch (e) { setTg((t) => ({ ...t, busy: false })); toast.error("Telegram", (e as Error).message); }
  };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-5xl">
      <section className="card p-5">
        <h3 className="font-black text-lg flex items-center gap-2 mb-4"><Store size={20} className="text-peach" /> Negocio</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre"><input className="input" {...f("business_name")} /></Field>
          <Field label="Eslogan"><input className="input" {...f("business_tagline")} /></Field>
          <Field label="Dirección" className="col-span-2"><input className="input" {...f("business_address")} /></Field>
          <Field label="Teléfono"><input className="input" {...f("business_phone")} /></Field>
          <Field label="Símbolo de moneda"><input className="input" {...f("currency")} /></Field>
          <Field label="Impuesto (%)" hint="0 si el precio ya lo incluye"><input className="input" type="number" step="0.1" min={0} {...f("tax_rate")} /></Field>
          <Field label="Prefijo de pedidos"><input className="input" maxLength={3} {...f("order_prefix")} /></Field>
          <Field label="Pie del ticket" className="col-span-2"><input className="input" {...f("receipt_footer")} /></Field>
          <Field label="URL pública (seguimiento)" hint="Ej: http://192.168.0.10:3001 — se imprime como QR en el ticket" className="col-span-2"><div className="relative"><Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-9" placeholder="http://…" {...f("public_url")} /></div></Field>
        </div>
      </section>
      <section className="card p-5">
        <h3 className="font-black text-lg flex items-center gap-2 mb-4"><Printer size={20} className="text-peach" /> Impresora térmica</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Modo de impresión</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setForm({ ...form, printer_mode: "browser" })} className={`p-3 rounded-xl border-2 text-left ${form.printer_mode === "browser" ? "border-peach bg-peach-soft" : "border-line"}`}><div className="font-extrabold text-sm flex items-center gap-1.5"><Printer size={15} /> Navegador</div><div className="text-xs font-semibold text-muted mt-1">Usa el driver de Windows (diálogo de impresión, 80 mm). Compatible con cualquier impresora.</div></button>
              <button onClick={() => setForm({ ...form, printer_mode: "network" })} className={`p-3 rounded-xl border-2 text-left ${form.printer_mode === "network" ? "border-peach bg-peach-soft" : "border-line"}`}><div className="font-extrabold text-sm flex items-center gap-1.5"><Wifi size={15} /> Red (ESC/POS)</div><div className="text-xs font-semibold text-muted mt-1">Envío directo por IP al puerto 9100. Sin diálogos, corta papel y abre cajón.</div></button>
            </div>
          </div>
          {form.printer_mode === "network" && (<>
            <Field label="IP de la impresora"><input className="input font-mono" {...f("printer_host")} /></Field>
            <Field label="Puerto"><input className="input font-mono" type="number" {...f("printer_port")} /></Field>
          </>)}
          <Field label="Ancho (caracteres)" hint="58 mm = 32 · 80 mm = 42 o 48"><select className="input" {...f("printer_width")}><option value={32}>32 (58 mm)</option><option value={42}>42 (80 mm)</option><option value={48}>48 (80 mm)</option></select></Field>
          <div className="flex items-end pb-2"><Toggle checked={!!form.auto_print} onChange={(v) => setForm({ ...form, auto_print: v })} label="Imprimir al crear pedido" /></div>
          {form.printer_mode === "network" && <div className="col-span-2"><button className="btn-soft btn-sm" onClick={test}><Printer size={15} /> Imprimir página de prueba</button></div>}
        </div>
      </section>
      <section className="card p-5 xl:col-span-2">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-black text-lg flex items-center gap-2"><Send size={20} className="text-peach" /> Telegram · copia de las fotos</h3>
            <p className="text-sm font-semibold text-muted mt-1">Cada foto que se sube al app (comprobantes de entradas y salidas de stock, fotos de productos) se reenvía a un canal o grupo de Telegram con el detalle del movimiento y quién lo hizo.</p>
          </div>
          <span className={`pill shrink-0 ${tg.ok ? "bg-mint-soft text-mint" : tgConfigured ? "bg-peach-soft text-peach" : "bg-line/60 text-muted"}`}>
            {tg.ok ? <><CheckCircle2 size={14} /> @{tg.ok.bot} → {tg.ok.chat}</> : tgConfigured ? "Configurado" : "Sin configurar"}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Field label="Token del bot" hint="Lo entrega @BotFather al crear el bot (/newbot)">
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-9 pr-10 font-mono text-sm" type={tg.showToken ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="123456789:AAH…" {...f("telegram_bot_token")} />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted hover:bg-line/60" title={tg.showToken ? "Ocultar" : "Mostrar"} onClick={() => setTg((t) => ({ ...t, showToken: !t.showToken }))}>{tg.showToken ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </Field>
          <Field label="ID del canal o grupo" hint="Ej: -1001234567890 o @micanal — el bot debe ser administrador del canal">
            <div className="relative"><Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-9 font-mono text-sm" spellCheck={false} placeholder="-100…" {...f("telegram_chat_id")} /></div>
          </Field>
          <button className="btn-soft" disabled={!tgConfigured || tg.busy} onClick={testTelegram}><Send size={16} /> {tg.busy ? "Enviando…" : "Enviar prueba"}</button>
        </div>
        <ol className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-semibold text-muted">
          <li className="rounded-xl bg-line/40 p-3"><span className="text-ink font-extrabold">1.</span> En Telegram abre <span className="text-ink">@BotFather</span>, envía <span className="font-mono text-ink">/newbot</span> y copia el token.</li>
          <li className="rounded-xl bg-line/40 p-3"><span className="text-ink font-extrabold">2.</span> Crea un canal privado y agrega el bot como <span className="text-ink">administrador</span> (puede publicar mensajes).</li>
          <li className="rounded-xl bg-line/40 p-3"><span className="text-ink font-extrabold">3.</span> Pega el ID del canal (reenvía un mensaje del canal a <span className="text-ink">@userinfobot</span> para verlo) y pulsa <span className="text-ink">Enviar prueba</span>.</li>
        </ol>
      </section>
      <div className="xl:col-span-2 flex justify-end"><button className="btn-primary btn-lg" disabled={busy} onClick={doSave}><Save size={20} /> Guardar ajustes</button></div>
    </div>
  );
}
