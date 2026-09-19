// Función serverless de Vercel: toda la API (/api/*) pasa por aquí (ver vercel.json). El front estático lo sirve el CDN.
// La carga es diferida para que un fallo de configuración/importación produzca JSON útil en vez de
// FUNCTION_INVOCATION_FAILED antes de que el handler pueda responder.
let appModule;
const loadApp = () => appModule ||= import("../server/src/app.js");

function initErrorCode(error) {
  const message = error?.message || "";
  if (error?.code === "ERR_MODULE_NOT_FOUND") return "module_not_found";
  if (/DATABASE_URL/i.test(message)) return "missing_database_url";
  if (error?.code === "28P01" || /password authentication failed|SASL.*password/i.test(message)) return "db_auth_failed";
  if (error?.code === "3D000") return "db_not_found";
  if (/^(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH|ENETUNREACH)$/.test(error?.code || "") || /timeout/i.test(message)) return "db_unreachable";
  if (error?.code === "ERR_INVALID_URL" || /invalid.*(?:url|connection string)/i.test(message)) return "invalid_database_url";
  if (/^[0-9A-Z]{5}$/.test(error?.code || "")) return `postgres_${String(error.code).toLowerCase()}`;
  return "api_init_failed";
}

const initErrorMessage = (code) => ({
  missing_database_url: "Falta DATABASE_URL en el servidor",
  db_auth_failed: "La contraseña o el usuario de DATABASE_URL no son válidos",
  db_not_found: "La base de datos indicada no existe",
  db_unreachable: "No se pudo conectar con el servidor de base de datos",
  invalid_database_url: "DATABASE_URL no tiene un formato válido",
  module_not_found: "Falta una dependencia de la API",
}[code] || "No se pudo iniciar la API");

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
      error: initErrorMessage(code),
      code,
    }));
  }
  return loaded.app(req, res);
}
