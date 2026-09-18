// Telegram mirror: every image the app stores (comprobantes de stock, fotos de productos) is also posted
// to the chat/channel the admin configured in Ajustes (bot token + chat id). Never blocks the request.
import { getSettings } from "./db.js";

const MAX_PHOTO = 10 * 1024 * 1024; // Bot API limit for sendPhoto; bigger files go as documents
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function call(token, method, body) {
  const isForm = body instanceof FormData;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `Telegram respondió ${r.status}`);
  return j.result;
}

/** Saved credentials, or null when the integration is not configured. */
export async function telegramConfig() {
  const s = await getSettings();
  const token = String(s.telegram_bot_token || "").trim();
  const chat = String(s.telegram_chat_id || "").trim();
  return token && chat ? { token, chat } : null;
}

/**
 * Build an HTML caption from lines; `{ b: text }` renders bold. Empty lines are dropped.
 * Example: caption(["📦 Entrada", { b: "Harina" }, "+5 kg"]).
 */
export function caption(lines) {
  return lines
    .filter((l) => l != null && l !== "")
    .map((l) => (typeof l === "object" ? `<b>${esc(l.b)}</b>` : esc(l)))
    .join("\n")
    .slice(0, 1024);
}

/** Post an image to the configured chat. Failures are logged, never thrown, so uploads are never blocked. */
export async function sendPhoto({ buf, mime, name, caption: text = "" }) {
  try {
    const cfg = await telegramConfig();
    if (!cfg) return false;
    const asDocument = buf.length > MAX_PHOTO;
    const fd = new FormData();
    fd.append("chat_id", cfg.chat);
    fd.append("parse_mode", "HTML");
    if (text) fd.append("caption", text);
    fd.append(asDocument ? "document" : "photo", new Blob([buf], { type: mime }), name);
    await call(cfg.token, asDocument ? "sendDocument" : "sendPhoto", fd);
    return true;
  } catch (e) {
    console.warn("[telegram] no se pudo enviar la foto:", e.message);
    return false;
  }
}

/** Validate token + chat (throws with Telegram's message) and post a confirmation. Returns bot and chat names. */
export async function testConnection(token, chat) {
  const me = await call(token, "getMe", {});
  const info = await call(token, "getChat", { chat_id: chat });
  await call(token, "sendMessage", {
    chat_id: chat, parse_mode: "HTML",
    text: "✅ <b>Gioka</b> conectado.\nLas fotos del app (comprobantes de stock y productos) llegarán a este chat.",
  });
  return { bot: me.username, chat: info.title || info.username || [info.first_name, info.last_name].filter(Boolean).join(" ") || chat };
}
