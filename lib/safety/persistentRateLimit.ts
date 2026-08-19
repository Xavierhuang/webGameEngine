/**
 * Shared, persistent rate-limit and concurrency-lease primitives.
 *
 * The in-memory limiter in `rateLimit.ts` is a per-process fixed-window
 * counter — good enough for the auth endpoints when the app ran as one
 * systemd unit, wrong for anything that needs to hold a quota across two
 * Node workers or across a restart. The AI routes and every future
 * shared-quota surface consume this module instead so a child does not
 * get their daily budget doubled by hitting a different worker on the
 * next request.
 *
 * State lives in `rate_limit_buckets` (migration 008). The row is keyed
 * by SHA-256 of `<scope>:<subjectHash>` so:
 *
 *   - a leaked table snapshot cannot be reversed to a real user id, IP
 *     address, or session token — every subject-facing column is a
 *     pseudonym or hash;
 *   - two independent processes derive the same bucket_key from the same
 *     inputs, so a single row is the source of truth per (scope, subject);
 *   - two callers with different secrets do NOT share buckets, which lets
 *     the audit-secret rotation invalidate old limiter state without
 *     touching the schema.
 *
 * All read-modify-write happens inside `withTransaction` with `SELECT ...
 * FOR UPDATE`, so concurrent limiter attempts against the same subject
 * serialize instead of racing. Lease release is idempotent — a handler
 * that throws before releasing still frees its slot when the caller
 * invokes `lease.release()` from a `finally` block, and a caller that
 * accidentally releases twice does not push `active_count` negative.
 */

import { createHash } from 'crypto';
import type { Pool } from 'mysql2/promise';
import { pseudonymizeActor } from './audit';
import { withTransaction } from '../mysql/transaction';

// Compose the primary key from scope and the pseudonymized subject. Storing
// SHA-256 of the composition (not the raw scope+subject) means the primary
// key itself is never a reversible pointer at the requester.
function computeBucketKey(scope: string, subjectHash: string): string {
  return createHash('sha256').update(`${scope}:${subjectHash}`).digest('hex');
}

export interface PersistentBucketOptions {
  // Route-owned namespace such as `ai:chat` or `signup`. Multiple routes
  // can share a subject without sharing budget.
  scope: string;
  // Raw actor/IP/session identifier. Never persisted directly — is HMAC'd
  // via `pseudonymizeActor` before it reaches the DB.
  subject: string;
  // Secret that keys the HMAC pseudonymization; rotating it invalidates
  // every existing bucket for the same subject (by design).
  secret: string;
  // Requests allowed per window before further requests are blocked.
  limit: number;
  // Length of the fixed window, in milliseconds.
  windowMs: number;
  now?: () => Date;
  pool?: Pool;
}

export interface PersistentRateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets. Zero when the request was allowed. */
  retryAfter: number;
  /** Requests still available in the current window. Zero on denial. */
  remaining: number;
}

export async function consumePersistentBucket(
  options: PersistentBucketOptions,
): Promise<PersistentRateLimitResult> {
  const nowFn = options.now ?? (() => new Date());
  const subjectHash = pseudonymizeActor(options.subject, options.secret);
  const bucketKey = computeBucketKey(options.scope, subjectHash);

  return withTransaction(async (connection) => {
    const now = nowFn();
    const [rows] = await connection.execute(
      `SELECT request_count, window_started_at, expires_at
         FROM rate_limit_buckets
        WHERE bucket_key = ?
        FOR UPDATE`,
      [bucketKey],
    );
    const list = rows as Array<{
      request_count: number;
      window_started_at: Date;
      expires_at: Date;
    }>;
    const existing = list[0];

    // Fresh row OR expired window: reset counters. The reset must not clear
    // active_count — outstanding leases are a separate concern and their
    // holders will release them on completion.
    const windowExpired = !existing || existing.expires_at.getTime() <= now.getTime();
    if (windowExpired) {
      const expiresAt = new Date(now.getTime() + options.windowMs);
      await connection.execute(
        `INSERT INTO rate_limit_buckets
             (bucket_key, scope, subject_hash, window_started_at, request_count, active_count, expires_at)
           VALUES (?, ?, ?, ?, 1, 0, ?)
         ON DUPLICATE KEY UPDATE
             window_started_at = VALUES(window_started_at),
             request_count = 1,
             expires_at = VALUES(expires_at)`,
        [bucketKey, options.scope, subjectHash, now, expiresAt],
      );
      return { allowed: true, retryAfter: 0, remaining: Math.max(0, options.limit - 1) };
    }

    const nextCount = existing.request_count + 1;
    if (nextCount > options.limit) {
      const retryAfterMs = existing.expires_at.getTime() - now.getTime();
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        remaining: 0,
      };
    }

    await connection.execute(
      `UPDATE rate_limit_buckets
          SET request_count = ?
        WHERE bucket_key = ?`,
      [nextCount, bucketKey],
    );
    return { allowed: true, retryAfter: 0, remaining: Math.max(0, options.limit - nextCount) };
  }, { pool: options.pool });
}

export interface PersistentLeaseOptions {
  scope: string;
  subject: string;
  secret: string;
  // Maximum simultaneous outstanding leases per (scope, subject).
  maxConcurrent: number;
  // How long a lease may live before the row's expiry is bumped. The
  // active_count field is authoritative — this only extends the row's TTL
  // for the periodic sweep so a long-running request does not have its
  // bucket garbage-collected out from under it.
  leaseTtlMs: number;
  now?: () => Date;
  pool?: Pool;
}

export interface PersistentLease {
  scope: string;
  subjectHash: string;
  release(): Promise<void>;
}

// Thrown by `withPersistentLease` when the caller cannot get a slot. Callers
// can catch this specific type and map it to a 503 `concurrency_limit`
// response without a `instanceof Error` guard swallowing other failures.
export class PersistentLeaseUnavailable extends Error {
  readonly code = 'persistent_lease_unavailable';
  constructor(scope: string) {
    super(`Concurrency lease exhausted for scope ${scope}`);
    this.name = 'PersistentLeaseUnavailable';
  }
}

export async function acquirePersistentLease(
  options: PersistentLeaseOptions,
): Promise<PersistentLease | null> {
  const nowFn = options.now ?? (() => new Date());
  const subjectHash = pseudonymizeActor(options.subject, options.secret);
  const bucketKey = computeBucketKey(options.scope, subjectHash);

  const acquired = await withTransaction(async (connection) => {
    const now = nowFn();
    const [rows] = await connection.execute(
      `SELECT active_count, expires_at
         FROM rate_limit_buckets
        WHERE bucket_key = ?
        FOR UPDATE`,
      [bucketKey],
    );
    const list = rows as Array<{ active_count: number; expires_at: Date }>;
    const existing = list[0];
    const currentActive = existing ? existing.active_count : 0;

    if (currentActive >= options.maxConcurrent) {
      return false;
    }

    const expiresAt = new Date(now.getTime() + options.leaseTtlMs);
    await connection.execute(
      `INSERT INTO rate_limit_buckets
           (bucket_key, scope, subject_hash, window_started_at, request_count, active_count, expires_at)
         VALUES (?, ?, ?, ?, 0, 1, ?)
       ON DUPLICATE KEY UPDATE
           active_count = active_count + 1,
           expires_at = GREATEST(expires_at, VALUES(expires_at))`,
      [bucketKey, options.scope, subjectHash, now, expiresAt],
    );
    return true;
  }, { pool: options.pool });

  if (!acquired) return null;

  let released = false;
  return {
    scope: options.scope,
    subjectHash,
    async release(): Promise<void> {
      // A caller that wraps this in a `finally` may double-call it if the
      // handler already called release explicitly. Ignoring the second call
      // avoids driving active_count negative, which would leak a slot next
      // time the bucket is inspected.
      if (released) return;
      released = true;
      await withTransaction(async (connection) => {
        await connection.execute(
          `UPDATE rate_limit_buckets
              SET active_count = IF(active_count > 0, active_count - 1, 0)
            WHERE bucket_key = ?`,
          [bucketKey],
        );
      }, { pool: options.pool });
    },
  };
}

export async function withPersistentLease<T>(
  options: PersistentLeaseOptions,
  handler: () => Promise<T>,
): Promise<T> {
  const lease = await acquirePersistentLease(options);
  if (!lease) {
    throw new PersistentLeaseUnavailable(options.scope);
  }
  try {
    return await handler();
  } finally {
    await lease.release();
  }
}

// Operator kill switch that lets a deployment opt into the shared
// persistent limiter while keeping the in-memory path available for tests
// that do not have MySQL. Route wrappers check this before dispatching so
// the same code path serves both environments.
const TRUE_VALUES: ReadonlySet<string> = new Set(['1', 'true', 'yes', 'on', 'enabled']);
export function isPersistentRateLimitEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.PERSISTENT_RATE_LIMIT;
  if (typeof raw !== 'string') return false;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}
