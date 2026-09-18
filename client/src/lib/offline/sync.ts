import { request, isOffline, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useNet, onOnline, probe } from "./net";
import { bus } from "./bus";
import { useQueue, pendingOps, removeOp, updateOp, dependents, refPath, type Op } from "./queue";

/**
 * Sync engine: replays the outbox in order as soon as the connection is back (and after every enqueue while online).
 *  - Network / db_offline errors stop the run; the queue is retried on the next probe.
 *  - 401 stops the run until someone logs in (the ops stay in the queue).
 *  - Any other API error marks that op (and the ops depending on it) as failed; they are shown to the user, who can
 *    retry or discard them. The rest of the queue continues.
 */

/** Build the HTTP request for an op. `offline: true` tells the server this is a replay of something that already happened. */
export function requestFor(op: Op, offline: boolean): { method: string; url: string; body: Record<string, unknown> } {
  const common = { op_id: op.id, at: op.at, offline, user_id: op.user.id };
  switch (op.kind) {
    case "order.create":
      return { method: "POST", url: "/api/orders", body: { ...op.body, client_id: op.id, created_at: op.at, offline, user_id: op.user.id, code: op.local.code, daily_number: op.local.daily_number } };
    case "order.pay":
      return { method: "POST", url: `/api/orders/${refPath(op.target)}/pay`, body: { ...common, payment_method: op.payment_method, cash_received: op.cash_received } };
    case "order.status":
      return { method: "PATCH", url: `/api/orders/${refPath(op.target)}/status`, body: { ...common, status: op.status } };
    case "cash.open":
      return { method: "POST", url: "/api/cash/open", body: { ...common, client_id: op.id, opened_at: op.at, opening_amount: op.opening_amount, notes: op.notes } };
    case "cash.close":
      return { method: "POST", url: "/api/cash/close", body: { ...common, ...("id" in op.target ? { session_id: op.target.id } : { session_client_id: op.target.client_id }), closing_amount: op.closing_amount, notes: op.notes } };
    case "stock.adjust":
      return { method: "POST", url: "/api/inventory/adjust", body: { ...common, client_id: op.id, created_at: op.at, item_type: op.item_type, item_id: "id" in op.target ? op.target.id : `c_${op.target.client_id}`, qty: op.qty, set: op.set, base_stock: op.base_stock, reason: op.reason, notes: op.notes, photo: op.photo } };
    case "ingredient.create":
      return { method: "POST", url: "/api/inventory/ingredients", body: { ...op.body, ...common, client_id: op.id, created_at: op.at, photo: op.photo } };
  }
}

export async function sendOp<T = unknown>(op: Op, offline: boolean, timeout?: number): Promise<T> {
  const r = requestFor(op, offline);
  return request<T>(r.method, r.url, r.body, { timeout });
}

let running: Promise<void> | null = null;

/** Replay pending ops. Returns when the queue is empty, blocked, or the connection dropped. */
export function flush(): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (!useNet.getState().online || !useAuth.getState().token) return;
    let sent = 0;
    useQueue.setState({ syncing: true, lastSyncError: null });
    try {
      for (const op of pendingOps()) {
        if (!useNet.getState().online) break;
        try {
          await sendOp(op, true, 60_000);
          await removeOp(op.id);
          sent++;
        } catch (e) {
          if (isOffline(e)) { useQueue.setState({ lastSyncError: (e as Error).message }); break; }
          if (e instanceof ApiError && e.status === 401) { useQueue.setState({ lastSyncError: "Inicia sesión para enviar los cambios pendientes" }); break; }
          const msg = (e as Error).message || "Error";
          await updateOp(op.id, { state: "failed", error: msg, tries: op.tries + 1 });
          for (const d of dependents(op.id)) await updateOp(d.id, { state: "failed", error: `Depende de una operación que falló: ${msg}`, tries: d.tries + 1 });
          // keep going with the rest of the queue
        }
      }
    } finally {
      useQueue.setState({ syncing: false, lastSyncAt: sent ? Date.now() : useQueue.getState().lastSyncAt });
      if (sent) bus.emit("sync:changed");
    }
  })().finally(() => { running = null; });
  return running;
}

/** Put a failed op back in the queue and try again. */
export async function retryOp(id: string) {
  await updateOp(id, { state: "pending", error: undefined });
  bus.emit("sync:changed");
  if (useNet.getState().online) void flush(); else void probe().then((ok) => { if (ok) void flush(); });
}
export async function retryAll() {
  for (const op of useQueue.getState().ops) if (op.state === "failed") await updateOp(op.id, { state: "pending", error: undefined });
  bus.emit("sync:changed");
  const ok = useNet.getState().online || (await probe());
  if (ok) await flush();
}
export async function discardOp(id: string) {
  for (const d of dependents(id)) await removeOp(d.id);
  await removeOp(id);
  bus.emit("sync:changed");
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  onOnline(() => { void flush(); });
  // A login while ops are waiting (e.g. after a 401) resumes the queue.
  useAuth.subscribe((s, prev) => { if (s.token && s.token !== prev.token) void flush(); });
}
