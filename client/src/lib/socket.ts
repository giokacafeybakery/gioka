import { io, type Socket } from "socket.io-client";
import { useEffect } from "react";

let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) socket = io({ transports: ["websocket", "polling"] });
  return socket;
}

/** Subscribe to one or more socket events for the lifetime of the component. */
export function useSocket(handlers: Record<string, (...args: any[]) => void>, deps: unknown[] = []) {
  useEffect(() => {
    const s = getSocket();
    for (const [ev, fn] of Object.entries(handlers)) s.on(ev, fn);
    return () => { for (const [ev, fn] of Object.entries(handlers)) s.off(ev, fn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
