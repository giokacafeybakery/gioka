import express from "express";
import compression from "compression";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { get, now, initDb, isDbOffline, dbAlive } from "./db.js";
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

app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: "12mb" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads"), { maxAge: "30d", immutable: true }));

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
app.use("/api/inventory", requireAuth, requireRole("admin", "inventario"), inventoryRoutes(io));
app.use("/api/reports", requireAuth, requireRole("admin"), reportRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/print", requireAuth, printRoutes);
app.use("/api/cash", requireAuth, cashRoutes(io));

// Health probe used by the clients to decide online/offline: the API must answer AND reach the database.
app.get("/api/health", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const db = await dbAlive();
  res.status(db ? 200 : 503).json({ ok: db, db, time: now(), ...(db ? {} : { error: "Sin conexión con la base de datos", code: "db_offline" }) });
});

// Serve built client (production)
const dist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(dist)) {
  // Hashed assets + brand images are immutable; the HTML shell and the service worker must always revalidate.
  app.use(express.static(dist, {
    index: false,
    setHeaders: (res, file) => {
      const rel = path.relative(dist, file).replace(/\\/g, "/");
      if (/^(assets|brand|icons)\//.test(rel)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      else res.setHeader("Cache-Control", "no-cache");
    },
  }));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  // Database unreachable (server on the LAN without internet): tell the clients so they keep working offline and retry later.
  if (isDbOffline(err)) {
    console.warn("Base de datos inaccesible:", err.message);
    return res.status(503).json({ error: "Sin conexión con la base de datos", code: "db_offline" });
  }
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
