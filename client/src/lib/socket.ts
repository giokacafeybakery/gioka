import { io, type Socket } from "socket.io-client";
import { useEffect } from "react";
import { bus } from "./offline/bus";
import { probe, reportFailure } from "./offline/net";

let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ transports: ["websocket", "polling"] });
    // The socket is the fastest signal that the server went away / came back; the probe confirms the database too.
    socket.on("connect", () => { void probe(); });
    socket.on("disconnect", (reason) => { if (reason !== "io client disconnect") reportFailure("Se perdió la conexión con el servidor"); });
  }
  return socket;
}

/**
 * Subscribe to one or more events for the lifetime of the component. Events arrive both from the server (Socket.IO)
 * and from the local offline queue (same names, e.g. "order:created" when an order is stored on the device), plus
 * "sync:changed" whenever the queue changes or finishes sending.
 */
export function useSocket(handlers: Record<string, (...args: any[]) => void>, deps: unknown[] = []) {
  useEffect(() => {
    const s = getSocket();
    for (const [ev, fn] of Object.entries(handlers)) { s.on(ev, fn); bus.on(ev, fn); }
    return () => { for (const [ev, fn] of Object.entries(handlers)) { s.off(ev, fn); bus.off(ev, fn); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
