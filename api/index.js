// Función serverless de Vercel: toda la API (/api/*) pasa por aquí (ver vercel.json). El front estático lo sirve el CDN.
// La carga es diferida para que un fallo de configuración/importación produzca JSON útil en vez de
// FUNCTION_INVOCATION_FAILED antes de que el handler pueda responder.
let appModule;
const loadApp = () => appModule ||= import("../server/src/app.js");

function initErrorCode(error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return "module_not_found";
  if (/DATABASE_URL/i.test(error?.message || "")) return "missing_database_url";
  return "api_init_failed";
}

export default async function handler(req, res) {
  let loaded;
  try {
    loaded = await loadApp();
    await loaded.ready();
  } catch (e) {
    const code = initErrorCode(e);
    console.error("No se pudo iniciar la API:", e?.stack || e);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      error: code === "missing_database_url" ? "Falta DATABASE_URL en el servidor" : "No se pudo iniciar la API",
      code,
    }));
  }
  return loaded.app(req, res);
}
