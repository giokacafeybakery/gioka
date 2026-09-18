import { useEffect } from "react";
import { bus } from "./offline/bus";
import { probe } from "./offline/net";

/**
 * Live events. The server publishes them on a Supabase Realtime channel (Broadcast API) and the browser subscribes
 * with the public anon key, so it works whether the API runs on a PC of the café or as serverless functions (Vercel).
 * The hook keeps the old Socket.IO shape: `useSocket({ "order:created": fn })`.
 */
type Handler = (...args: any[]) => void;
type Config = { enabled: false } | { enabled: true; url: string; key: string; topic: string };

const listeners = new Map<string, Set<Handler>>();
let starting: Promise<void> | null = null;
let connected = false;
let everConnected = false;

function dispatch(event: string, data: unknown) {
  for (const fn of listeners.get(event) || []) { try { fn(data); } catch (e) { console.error(e); } }
}

/** True while the realtime channel is joined (the UI can show "en vivo"). */
export const isLive = () => connected;

async function start() {
  let cfg: Config;
  try {
    const r = await fetch("/api/realtime", { cache: "no-store" });
    cfg = r.ok ? await r.json() : { enabled: false };
  } catch { cfg = { enabled: false }; }
  if (!cfg.enabled) { starting = null; return; }
  const { RealtimeClient } = await import("@supabase/realtime-js");
  const client = new RealtimeClient(cfg.url.replace(/^http/, "ws") + "/realtime/v1", {
    params: { apikey: cfg.key },
    heartbeatIntervalMs: 25_000,
  });
  const channel = client.channel(cfg.topic);
  channel.on("broadcast", { event: "*" }, (msg: { event: string; payload?: { data?: unknown } }) => {
    dispatch(msg.event, msg.payload?.data ?? null);
  });
  channel.subscribe((status) => {
    const was = connected;
    connected = status === "SUBSCRIBED";
    if (connected && !was) {
      // Rejoined after a gap: events may have been missed → pages refetch on "sync:changed"; also confirm the API.
      if (everConnected) { void probe(); bus.emit("sync:changed"); }
      everConnected = true;
    }
  });
}

function ensure() {
  if (!starting) starting = start().catch((e) => { console.warn("Realtime:", e); starting = null; });
}

/**
 * Subscribe to one or more events for the lifetime of the component. Events arrive both from the server (Realtime)
 * and from the local offline queue (same names, e.g. "order:created" when an order is stored on the device), plus
 * "sync:changed" whenever the queue changes or finishes sending.
 */
export function useSocket(handlers: Record<string, Handler>, deps: unknown[] = []) {
  useEffect(() => {
    ensure();
    for (const [ev, fn] of Object.entries(handlers)) {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(fn);
      bus.on(ev, fn);
    }
    return () => {
      for (const [ev, fn] of Object.entries(handlers)) { listeners.get(ev)?.delete(fn); bus.off(ev, fn); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
