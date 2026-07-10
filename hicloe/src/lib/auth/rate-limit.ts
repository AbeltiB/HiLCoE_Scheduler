/**
 * Minimal in-memory, per-process rate limiter. Deliberately simple — this app
 * runs as a single Node.js server, not a distributed fleet, so a shared store
 * (Redis etc.) would be new infrastructure for no real benefit here. Bounds
 * request volume per key (e.g. per IP) independent of which account is being
 * targeted, which the existing per-account lockout in login.ts can't do:
 * that only throttles repeated attempts against one email, not low-and-slow
 * credential stuffing spread across many different emails from one source.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let callsSinceSweep = 0;

function sweepExpired(now: number) {
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/** Returns true if `key` has exceeded `max` hits within the current `windowMs` window. */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (++callsSinceSweep >= 1000) {
    callsSinceSweep = 0;
    sweepExpired(now);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  b.count += 1;
  return b.count > max;
}
