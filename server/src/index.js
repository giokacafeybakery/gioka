import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { get, now, initDb } from "./db.js";
import { ensureBucket } from "./storage.js";
import authRoutes, { requireAuth, requireRole } from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import orderRoutes from "./routes/orders.js";
import inventoryRoutes from "./routes/inventory.js";
import reportRoutes from "./routes/reports.js";
import settingsRoutes from "./routes/settings.js";
import printRoutes from "./routes/print.js";
import cashRoutes from "./routes/cash.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: true } });

app.use(express.json({ limit: "12mb" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Attach user (if token present) to every request
app.use(async (req, _res, next) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token) try {
    const row = await get(
      "SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND u.active=1",
      token,
    );
    if (row) req.user = row;
  } catch (e) { return next(e); }
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api/orders", orderRoutes(io));
app.use("/api/inventory", requireAuth, requireRole("admin", "cajero", "inventario"), inventoryRoutes(io));
app.use("/api/reports", requireAuth, requireRole("admin"), reportRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/print", requireAuth, printRoutes);
app.use("/api/cash", requireAuth, cashRoutes(io));

app.get("/api/health", (_req, res) => res.json({ ok: true, time: now() }));

// Serve built client (production)
const dist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Error interno" });
});

io.on("connection", (socket) => {
  socket.on("join", (room) => socket.join(room));
});

const PORT = process.env.PORT || 3001;
try {
  await initDb();
  const bucket = await ensureBucket().catch((e) => { console.warn("Storage: no se pudo verificar el bucket (" + e.message + "); se reintenta al subir la primera foto."); return !!process.env.SUPABASE_URL; });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🐼 Gioka server listo en http://localhost:${PORT} · Postgres (Supabase)${bucket ? " · Storage" : ""}`);
  });
} catch (e) {
  console.error("No se pudo iniciar:", e.message);
  process.exit(1);
}
