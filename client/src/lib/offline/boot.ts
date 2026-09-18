import { hydrateCache } from "./cache";
import { loadQueue } from "./queue";
import { startNet } from "./net";
import { startSync, flush } from "./sync";
import { bus } from "./bus";
import { useQueue } from "./queue";
import { startWarm, warmCache } from "./warm";

/** Wire the offline layer once at startup: warm the read cache, load the outbox, start probing and syncing. */
export async function initOffline() {
  await Promise.all([hydrateCache(), loadQueue()]);
  startSync();
  startWarm();
  startNet();
  // Screens that mounted before the queue was read re-render with the pending ops projected.
  if (useQueue.getState().ops.length) bus.emit("sync:changed");
  void flush().then(() => warmCache());
}
