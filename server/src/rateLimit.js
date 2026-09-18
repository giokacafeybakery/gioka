// In-memory sliding-window rate limiter — no external dependencies.
// Each key (e.g. IP) gets a window of `windowMs` with at most `max` requests.
// On Vercel each cold-start has its own Map, so it's "best effort" there;
// on the local server (cafetería) it works perfectly.

/**
 * @param {{ windowMs?: number, max?: number, message?: string, keyGenerator?: (req) => string }} opts
 */
export function rateLimit({ windowMs = 60_000, max = 60, message = "Demasiadas solicitudes, intenta de nuevo en un momento.", keyGenerator } = {}) {
  const hits = new Map(); // key → { count, resetAt }
  const key = keyGenerator || ((req) => req.ip || req.socket?.remoteAddress || "unknown");

  // Sweep expired entries every 2 minutes to avoid leaking memory.
  const sweep = () => { const now = Date.now(); for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k); };
  const timer = setInterval(sweep, 120_000);
  if (timer.unref) timer.unref(); // don't keep the process alive

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) { entry = { count: 0, resetAt: now + windowMs }; hits.set(k, entry); }
    entry.count++;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
