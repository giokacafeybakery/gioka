// Tiempo real sin proceso permanente: el servidor publica cada evento en un canal de Supabase Realtime por REST
// (Broadcast API) y los navegadores lo escuchan con la clave pública. Así funciona igual en un servidor local
// (LAN de la cafetería) y en funciones serverless (Vercel), donde un WebSocket propio no sobreviviría.
import { background } from "./bg.js";

export const TOPIC = process.env.REALTIME_TOPIC || "gioka";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_KEY;
export const enabled = !!(url && secret);

let warned = false;

/** Publish an event to every connected client. Fire-and-forget: a Realtime hiccup never fails the request. */
export function emit(event, payload) {
  if (!enabled) {
    if (!warned) { warned = true; console.warn("Realtime: falta SUPABASE_URL/SUPABASE_SERVICE_KEY; los eventos en vivo están desactivados."); }
    return;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  background(
    fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      // Payload wrapped in { data } so `null` (cash closed) travels as a valid JSON object.
      body: JSON.stringify({ messages: [{ topic: TOPIC, event, payload: { data: payload ?? null } }] }),
      signal: ctrl.signal,
    })
      .then(async (r) => { if (!r.ok) console.warn(`Realtime ${event}: HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`); })
      .catch((e) => console.warn(`Realtime ${event}:`, e.message))
      .finally(() => clearTimeout(t)),
  );
}

/** What the browser needs to subscribe (public: the anon key is meant to be shipped to clients; RLS guards the tables). */
export function clientConfig() {
  return enabled && process.env.SUPABASE_ANON_KEY
    ? { enabled: true, url, key: process.env.SUPABASE_ANON_KEY, topic: TOPIC }
    : { enabled: false };
}
