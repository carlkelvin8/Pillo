/**
 * Best-effort in-memory limiter (per server instance). It slows abuse of public endpoints but is NOT a
 * substitute for a platform firewall: on serverless each instance has its own counters.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function resetRateLimits(): void {
  buckets.clear();
}
