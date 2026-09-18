// Trabajo en segundo plano tras responder (Telegram, Realtime). En Vercel la función se congela al terminar la
// respuesta, así que hay que registrar la promesa con `waitUntil`; en un servidor normal basta con no esperarla.
let waitUntil = null;
if (process.env.VERCEL) {
  try { ({ waitUntil } = await import("@vercel/functions")); } catch { /* sin el paquete: se espera en línea */ }
}

export function background(promise) {
  const p = Promise.resolve(promise).catch((e) => console.warn("Tarea en segundo plano:", e?.message || e));
  if (waitUntil) waitUntil(p);
  else void p;
}
