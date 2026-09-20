// Image storage: Supabase Storage (bucket "gioka", public) when SUPABASE_URL + SUPABASE_SERVICE_KEY are set,
// otherwise the local server/uploads folder. Both return the URL to store in the database.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { sendPhoto } from "./telegram.js";
import { background } from "./bg.js";

const defaultUploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");
// On Vercel (serverless), /var/task is read-only; use /tmp instead.
const uploadsDir = process.env.VERCEL ? path.join("/tmp", "gioka-uploads") : defaultUploadsDir;
const BUCKET = process.env.SUPABASE_BUCKET || "gioka";
const supa = () => {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY;
  return url && key ? { url, key } : null;
};

const parse = (dataUrl, types) => {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  const m = dataUrl.match(new RegExp(`^data:image/(${types});base64,(.+)$`));
  if (!m) return null;
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  return { ext, mime: `image/${m[1]}`, buf: Buffer.from(m[2], "base64") };
};

/** Make sure the public bucket exists (idempotent). */
export async function ensureBucket() {
  const s = supa();
  if (!s) return false;
  const h = { Authorization: `Bearer ${s.key}`, apikey: s.key, "Content-Type": "application/json" };
  const r = await fetch(`${s.url}/storage/v1/bucket/${BUCKET}`, { headers: h });
  if (r.ok) return true;
  const c = await fetch(`${s.url}/storage/v1/bucket`, { method: "POST", headers: h, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 10 * 1024 * 1024 }) });
  if (!c.ok && c.status !== 409) throw new Error(`No se pudo crear el bucket ${BUCKET}: ${await c.text()}`);
  return true;
}

/**
 * Persist a base64 data URL. `name` is the file name without extension (e.g. "p12-1699999").
 * Options: `types` (allowed extensions regex, default png/jpg/webp/gif) and `caption` (HTML text for the Telegram copy).
 * Every stored image is also mirrored to Telegram when the admin configured a bot (fire-and-forget).
 * Returns a URL (absolute for Supabase, "/uploads/…" for local) or null when the data URL is invalid.
 */
export async function saveImage(dataUrl, name, { types = "png|jpe?g|webp|gif", caption = "" } = {}) {
  const img = parse(dataUrl, types);
  if (!img) return null;
  const file = `${name}.${img.ext}`;
  const url = await store(img, file);
  background(sendPhoto({ buf: img.buf, mime: img.mime, name: file, caption }));
  return url;
}

async function store(img, file) {
  const s = supa();
  if (s) {
    const r = await fetch(`${s.url}/storage/v1/object/${BUCKET}/${file}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.key}`, apikey: s.key, "Content-Type": img.mime, "x-upsert": "true" },
      body: img.buf,
    });
    if (!r.ok) throw new Error(`Supabase Storage: ${r.status} ${await r.text()}`);
    return `${s.url}/storage/v1/object/public/${BUCKET}/${file}`;
  }
  
  if (process.env.VERCEL) {
    // Vercel serverless functions have ephemeral filesystems.
    // We cannot serve files from /tmp across requests, so we store them as Base64 in SQLite.
    return `data:${img.mime};base64,${img.buf.toString("base64")}`;
  }
  
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, file), img.buf);
  return `/uploads/${file}`;
}
