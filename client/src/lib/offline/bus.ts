/**
 * In-tab event bus. Offline operations emit the same event names the server broadcasts over Socket.IO
 * ("order:created", "stock:updated", "cash:updated"…) plus "sync:changed" after every queue change, so pages that
 * subscribe through useSocket() refresh exactly the same way whether the change came from the network or from the queue.
 */
type Handler = (...args: any[]) => void;
const handlers = new Map<string, Set<Handler>>();

export const bus = {
  on(event: string, fn: Handler) { (handlers.get(event) || handlers.set(event, new Set()).get(event)!).add(fn); },
  off(event: string, fn: Handler) { handlers.get(event)?.delete(fn); },
  emit(event: string, ...args: unknown[]) {
    for (const fn of [...(handlers.get(event) || [])]) { try { fn(...args); } catch (e) { console.error(e); } }
  },
};
