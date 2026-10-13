/**
 * In-memory fixed-window rate limiter (in-process local memory caching only,
 * no Redis). Keys are namespaced like "login:ip:email".
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
let lastPrune = Date.now()

function prune(now: number) {
  if (now - lastPrune < 60_000) return
  lastPrune = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  prune(now)
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }
  bucket.count += 1
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  return { ok: true, retryAfterSec: 0 }
}

/** Throws ApiError(429) when the limit is exceeded. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<void> {
  const { ApiError } = await import('./errors')
  const result = rateLimit(key, limit, windowMs)
  if (!result.ok) {
    throw ApiError.tooMany('Too many requests — please slow down.', result.retryAfterSec)
  }
}
