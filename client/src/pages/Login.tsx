import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { PandaMark, Wordmark } from "@/components/Logo";
import { login } from "@/lib/actions";
import { useAuth } from "@/store/auth";
import { useNet } from "@/lib/offline/net";
import { homeFor } from "@/lib/nav";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setSession = useAuth((s) => s.setSession);
  const online = useNet((s) => s.online);
  const known = useNet((s) => s.known);
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await login(email, password);
      setSession(r.token, r.user);
      nav(homeFor(r.user.role), { replace: true });
    } catch (err) {
      setError((err as Error).message); setPassword("");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full flex flex-col lg:flex-row bg-cream">
      <div className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden bg-ink text-white">
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-peach/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 w-[560px] h-[560px] rounded-full bg-pink/20 blur-3xl" />
        <div className="relative text-center px-10 anim-fade-up">
          <div className="inline-grid place-items-center w-52 h-52 rounded-[2.5rem] bg-white/10 mb-10 anim-wiggle"><PandaMark size={150} ink="#FFFDF8" /></div>
          <Wordmark height={120} color="#FFFDF8" className="mx-auto" />
          <p className="mt-10 text-white/50 font-semibold max-w-sm mx-auto">Punto de venta, pedidos en tiempo real, inventario y reportes. Todo en un solo lugar.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm anim-fade-up">
          <div className="lg:hidden flex flex-col items-center mb-8"><Wordmark height={72} /></div>
          <h1 className="text-2xl font-black tracking-tight text-center">Iniciar sesión</h1>
          <p className="text-center text-muted font-semibold text-sm mt-1">Usa el correo y la contraseña asignados por el administrador</p>

          {known && !online && <div className="mt-6 text-center text-xs font-bold text-[#9a6b00] bg-butter-soft rounded-xl py-2 px-3 anim-pop">Sin conexión: puedes entrar con una cuenta que ya haya iniciado sesión en este dispositivo.</div>}
          {error && <div className="mt-6 text-center text-sm font-bold text-berry bg-berry-soft rounded-xl py-2 anim-pop">{error}</div>}

          <div className="mt-6 space-y-3">
            <div>
              <label className="label">Correo</label>
              <div className="relative"><Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input autoFocus type="email" autoComplete="username" className="input h-12 pl-11" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input type={show ? "text" : "password"} autoComplete="current-password" className="input h-12 pl-11 pr-11" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center text-muted hover:text-ink rounded-lg" aria-label="Mostrar contraseña">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </div>
          </div>

          <button type="submit" disabled={busy || !email || !password} className="btn-primary btn-lg w-full mt-6">Entrar <ArrowRight size={20} /></button>

          <div className="mt-8 text-center text-xs text-muted font-semibold leading-relaxed">
            Cuentas de demo · <b>admin@gioka.com</b> / admin123<br /><b>cajero@gioka.com</b> / cajero123 · <b>cocina@gioka.com</b> / cocina123<br /><b>inventario@gioka.com</b> / inventario123
          </div>
        </form>
      </div>
    </div>
  );
}
