// Función serverless de Vercel: toda la API (/api/*) pasa por aquí (ver vercel.json). El front estático lo sirve el CDN.
import { app, ready } from "../server/src/app.js";

export default async function handler(req, res) {
  try {
    await ready();
  } catch (e) {
    console.error("No se pudo preparar la base de datos:", e.message);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Sin conexión con la base de datos", code: "db_offline" }));
  }
  return app(req, res);
}
