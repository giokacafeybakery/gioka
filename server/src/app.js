// La aplicación Express, sin servidor HTTP: la usa `index.js` (servidor local / LAN) y `api/index.js` (función de Vercel).
import express from "express";
import compression from "compression";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { get, now, initDb, isDbOffline, dbAlive } from "./db.js";
import { ensureBucket } from "./storage.js";
import { clientConfig } from "./realtime.js";
import authRoutes, { requireAuth, requireRole } from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import orderRoutes from "./routes/orders.js";
import inventoryRoutes from "./routes/inventory.js";
import reportRoutes from "./routes/reports.js";
import settingsRoutes from "./routes/settings.js";
import printRoutes from "./routes/print.js";
import cashRoutes from "./routes/cash.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();

// Vercel comprime por su cuenta; en el servidor propio lo hacemos aquí.
if (!process.env.VERCEL) app.use(compression({ threshold: 1024 }));
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
app.use("/api/orders", orderRoutes());
app.use("/api/inventory", requireAuth, requireRole("admin", "inventario"), inventoryRoutes());
app.use("/api/reports", requireAuth, requireRole("admin"), reportRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/print", requireAuth, printRoutes);
app.use("/api/cash", requireAuth, cashRoutes());

// Public: how the browser subscribes to live events (Supabase Realtime, anon key + topic).
app.get("/api/realtime", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(clientConfig());
});

// Health probe used by the clients to decide online/offline: the API must answer AND reach the database.
app.get("/api/health", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const db = await dbAlive();
  res.status(db ? 200 : 503).json({ ok: db, db, time: now(), ...(db ? {} : { error: "Sin conexión con la base de datos", code: "db_offline" }) });
});

// Serve built client (production on our own server; on Vercel the static files come from the CDN)
const dist = path.join(__dirname, "..", "..", "client", "dist");
if (!process.env.VERCEL && fs.existsSync(dist)) {
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

let readyPromise = null;
/** Schema/seed + bucket check, once per process (per serverless instance). Safe to call on every request. */
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await initDb();
      return ensureBucket().catch((e) => {
        console.warn("Storage: no se pudo verificar el bucket (" + e.message + "); se reintenta al subir la primera foto.");
        return !!process.env.SUPABASE_URL;
      });
    })().catch((e) => { readyPromise = null; throw e; }); // next request retries
  }
  return readyPromise;
}
