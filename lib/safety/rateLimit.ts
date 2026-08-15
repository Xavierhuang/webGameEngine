/**
 * In-process rate limiting for auth endpoints.
 *
 * There was none anywhere: login, signup and password reset could be hammered
 * without limit, which makes credential stuffing and email-bombing free.
 *
 * Deliberately simple — a fixed-window counter in module memory. That is
 * adequate for a single-process deployment (this app runs as one systemd unit)
 * and has no infrastructure cost. It is NOT correct across multiple replicas;
 * move to Redis or the database before scaling out.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Evict expired buckets so the map can't grow without bound. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. */
  retryAfter: number;
  remaining: number;
}

/**
 * Count one hit against `key`. Returns whether it is allowed.
 *
 * @param limit  max hits per window
 * @param windowMs  window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0, remaining: limit - 1 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  return { allowed: true, retryAfter: 0, remaining: limit - bucket.count };
}

/** Best-effort client identity for rate limiting, behind nginx. */
export function clientKey(request: Request, scope: string): string {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim() || headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

/**
 * A message that tells the truth about how long the wait is.
 *
 * The signup route said "please wait a few minutes" while enforcing a
 * one-hour window, so a locked-out classroom would retry, fail, and conclude
 * the site was broken.
 */
export function retryMessage(retryAfterSeconds: number): string {
  const mins = Math.ceil(retryAfterSeconds / 60);
  if (mins <= 1) return 'Too many attempts. Please wait a minute and try again.';
  if (mins < 60) return `Too many attempts. Please try again in about ${mins} minutes.`;
  const hours = Math.round(mins / 60);
  return `Too many attempts. Please try again in about ${hours === 1 ? 'an hour' : `${hours} hours`}.`;
}

/** Testing helper — clears all buckets. */
export function resetRateLimits() {
  buckets.clear();
}
