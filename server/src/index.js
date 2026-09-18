// Servidor propio (PC de la cafetería / LAN): sirve la API y el client compilado en un solo puerto.
import http from "node:http";
import { app, ready } from "./app.js";
import { enabled as realtime } from "./realtime.js";

const PORT = process.env.PORT || 3001;
try {
  const bucket = await ready();
  http.createServer(app).listen(PORT, "0.0.0.0", () => {
    console.log(`🐼 Gioka server listo en http://localhost:${PORT} · Postgres (Supabase)${bucket ? " · Storage" : ""}${realtime ? " · Realtime" : " · sin eventos en vivo"}`);
  });
} catch (e) {
  console.error("No se pudo iniciar:", e.message);
  process.exit(1);
}
