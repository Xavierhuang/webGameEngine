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

// The subset of Request the trust-hop-aware key extractor actually reads.
// Accepting a structural type here keeps `clientKeyFromRequest` testable
// with a plain object whose `headers` is any Map-shaped thing, without
// having to construct a real `Request` in every unit test.
export interface HeadersLike {
  get(name: string): string | null | undefined;
}
export interface RequestLike {
  headers: HeadersLike;
}

export interface ClientKeyOptions {
  // Number of proxies the deployment operator has placed in front of this
  // process. Zero means the process is directly exposed and every
  // X-Forwarded-For value is attacker-controlled.
  trustedProxyHops: number;
}

/**
 * Trust-hop-aware client key extractor.
 *
 * The legacy `clientKey` above unconditionally trusts the leftmost value
 * of `X-Forwarded-For`, which is whatever the client sent. That is the
 * exact defect a persistent limiter cannot inherit: an attacker who
 * chooses the header chooses their bucket. `clientKeyFromRequest` reads
 * `trustedProxyHops` (from `readSecurityConfig`) and returns a single
 * `<scope>:untrusted` key whenever the header cannot be trusted, so an
 * attacker rotating X-Forwarded-For lands in the same bucket every time
 * instead of spinning up fresh ones.
 *
 * With `hops = N` we take the Nth value from the right of X-Forwarded-For:
 *
 *   - `hops = 0` — direct exposure. The header is entirely
 *     attacker-controlled; return the fallback so the limiter groups all
 *     traffic together.
 *   - `hops = 1` — one trusted proxy (e.g. nginx with
 *     `proxy_add_x_forwarded_for`) appended the real peer IP as the last
 *     value. Take that.
 *   - `hops = 2` — two trusted proxies each appended the previous peer.
 *     Take the second-from-right value.
 *   - If the header is missing values (length < hops), the client sent a
 *     shorter chain than our topology promises. Do NOT invent a value;
 *     fall back to the untrusted bucket.
 */
export function clientKeyFromRequest(
  request: RequestLike,
  scope: string,
  options: ClientKeyOptions,
): string {
  const hops = options.trustedProxyHops;
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error('trustedProxyHops must be a non-negative integer');
  }

  if (hops === 0) {
    return `${scope}:untrusted`;
  }

  const raw = request.headers.get('x-forwarded-for') || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const index = list.length - hops;
  if (index < 0 || index >= list.length) {
    return `${scope}:untrusted`;
  }

  const value = list[index];
  if (!value) {
    return `${scope}:untrusted`;
  }
  return `${scope}:${value}`;
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
