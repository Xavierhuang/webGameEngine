/**
 * Shared persistent rate limiter — MySQL-backed.
 *
 * The in-memory limiter (`lib/safety/rateLimit.ts`) is per-process. The AI
 * routes are the first place this stops being safe: two Node workers behind
 * nginx would each grant a child their own daily quota. Everything under
 * "Shared quotas" in the trust-boundary plan requires that two independent
 * limiter instances agree on the same bucket, and that concurrency leases
 * return to the pool whether the request succeeded or blew up. This suite
 * asserts both against a real MySQL — the whole point of the module is
 * cross-process sharing, so a mocked test would only prove that the mock
 * shares state with itself.
 *
 * Also asserts the trust-hop rule that a client with a chosen X-Forwarded-For
 * header cannot pick which bucket it lands in when the deployment has no
 * trusted proxies in front.
 *
 * Requires a running MySQL with `gameengine_test` reachable on 127.0.0.1
 * (see docs/superpowers/RESUME.md "MySQL for local tests"). If MySQL is not
 * available the suite skips loudly rather than passing on nothing.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const mysql = require('mysql2/promise');
const {
  consumePersistentBucket,
  acquirePersistentLease,
  withPersistentLease,
  PersistentLeaseUnavailable,
  isPersistentRateLimitEnabled,
} = require('../.build/lib/safety/persistentRateLimit');
const { clientKeyFromRequest } = require('../.build/lib/safety/rateLimit');

const DB_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASSWORD = process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.MYSQL_DATABASE || 'gameengine_test';
const SECRET = 'test-secret-for-persistent-limiter';

if (!DB_NAME.includes('_test')) {
  throw new Error(
    `Refusing to run destructive persistent-limiter tests against ${DB_NAME}; ` +
      'database name must contain _test'
  );
}

let pool = null;
let mysqlUnavailableReason = null;

test.before(async () => {
  try {
    pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      connectionLimit: 4,
      waitForConnections: true,
      queueLimit: 0,
    });
    // Fail fast if the server or database is unreachable rather than blocking
    // every subtest behind its own connect-timeout.
    const conn = await pool.getConnection();
    conn.release();
  } catch (error) {
    mysqlUnavailableReason = error instanceof Error ? error.message : String(error);
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }
  }
});

test.after(async () => {
  if (pool) await pool.end();
});

function requireMysql(t) {
  if (!pool) {
    t.skip(`MySQL not reachable: ${mysqlUnavailableReason}`);
    return false;
  }
  return true;
}

async function clearBuckets(scope) {
  await pool.query('DELETE FROM rate_limit_buckets WHERE scope = ?', [scope]);
}

test('two limiter instances share the same DB bucket', async (t) => {
  if (!requireMysql(t)) return;
  const scope = 'test:shared-window';
  await clearBuckets(scope);
  const subject = 'shared-subject-1';
  const limit = 3;
  const windowMs = 60_000;

  const results = [];
  for (let i = 0; i < 5; i++) {
    // Fresh options object per call: the persistence layer must not rely on
    // any in-process cache that would let two "instances" see different counts.
    const opts = { scope, subject, secret: SECRET, limit, windowMs, pool };
    results.push(await consumePersistentBucket(opts));
  }

  assert.equal(results[0].allowed, true);
  assert.equal(results[1].allowed, true);
  assert.equal(results[2].allowed, true);
  assert.equal(results[3].allowed, false, 'fourth call must be blocked by the shared bucket');
  assert.equal(results[4].allowed, false, 'fifth call must still be blocked');
  assert.ok(results[3].retryAfter >= 1, `retryAfter should be seconds until window closes, got ${results[3].retryAfter}`);
});

test('window resets after the configured interval', async (t) => {
  if (!requireMysql(t)) return;
  // Use a >=1s window because `rate_limit_buckets.expires_at` is a plain
  // MySQL TIMESTAMP (second precision). Sub-second windows would get
  // truncated on store and let a repeat call slip through as a fresh
  // window before the test's own sleep completes.
  const scope = 'test:window-reset';
  await clearBuckets(scope);
  const subject = 'reset-subject';
  const limit = 2;
  const windowMs = 1500;
  const opts = { scope, subject, secret: SECRET, limit, windowMs, pool };

  assert.equal((await consumePersistentBucket(opts)).allowed, true);
  assert.equal((await consumePersistentBucket(opts)).allowed, true);
  assert.equal((await consumePersistentBucket(opts)).allowed, false);
  // Wait past the window plus a full second of TIMESTAMP-rounding slack.
  await new Promise((r) => setTimeout(r, windowMs + 1200));
  const after = await consumePersistentBucket(opts);
  assert.equal(after.allowed, true, 'window must actually reopen');
  assert.equal(after.remaining, limit - 1);
});

test('different subjects do not share a bucket', async (t) => {
  if (!requireMysql(t)) return;
  const scope = 'test:per-subject';
  await clearBuckets(scope);
  const limit = 1;
  const windowMs = 60_000;

  const a = await consumePersistentBucket({ scope, subject: 'A', secret: SECRET, limit, windowMs, pool });
  const b = await consumePersistentBucket({ scope, subject: 'B', secret: SECRET, limit, windowMs, pool });
  const aAgain = await consumePersistentBucket({ scope, subject: 'A', secret: SECRET, limit, windowMs, pool });
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true, "subject B must not share subject A's bucket");
  assert.equal(aAgain.allowed, false, "subject A's bucket must still be full");
});

test('concurrency lease releases on successful handler completion', async (t) => {
  if (!requireMysql(t)) return;
  const scope = 'test:lease-success';
  await clearBuckets(scope);
  const subject = 'lease-subject';
  const opts = { scope, subject, secret: SECRET, maxConcurrent: 1, leaseTtlMs: 60_000, pool };

  await withPersistentLease(opts, async () => 'ok');

  const second = await acquirePersistentLease(opts);
  assert.ok(second, 'lease slot must be free after successful release');
  await second.release();
});

test('concurrency lease releases even when the handler throws', async (t) => {
  if (!requireMysql(t)) return;
  const scope = 'test:lease-throw';
  await clearBuckets(scope);
  const subject = 'lease-subject-throw';
  const opts = { scope, subject, secret: SECRET, maxConcurrent: 1, leaseTtlMs: 60_000, pool };

  await assert.rejects(
    () => withPersistentLease(opts, async () => { throw new Error('boom'); }),
    /boom/,
  );

  const second = await acquirePersistentLease(opts);
  assert.ok(second, 'lease slot must be free after handler failure');
  await second.release();
});

test('lease refuses more concurrent holders than maxConcurrent', async (t) => {
  if (!requireMysql(t)) return;
  const scope = 'test:lease-cap';
  await clearBuckets(scope);
  const subject = 'lease-cap-subject';
  const opts = { scope, subject, secret: SECRET, maxConcurrent: 2, leaseTtlMs: 60_000, pool };

  const held = [
    await acquirePersistentLease(opts),
    await acquirePersistentLease(opts),
  ];
  assert.ok(held[0] && held[1], 'first two leases must acquire');

  const third = await acquirePersistentLease(opts);
  assert.equal(third, null, 'third concurrent lease must be denied');

  await assert.rejects(
    () => withPersistentLease(opts, async () => 'never'),
    PersistentLeaseUnavailable,
  );

  await held[0].release();
  const fourth = await acquirePersistentLease(opts);
  assert.ok(fourth, 'lease slot must free up after release');
  await fourth.release();
  await held[1].release();
});

test('double-release is a no-op — the caller cannot corrupt the counter', async (t) => {
  if (!requireMysql(t)) return;
  const scope = 'test:lease-double-release';
  await clearBuckets(scope);
  const subject = 'lease-double';
  const opts = { scope, subject, secret: SECRET, maxConcurrent: 2, leaseTtlMs: 60_000, pool };

  const lease = await acquirePersistentLease(opts);
  assert.ok(lease);
  await lease.release();
  await lease.release();
  await lease.release();

  const [rows] = await pool.query('SELECT active_count FROM rate_limit_buckets WHERE scope = ?', [scope]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].active_count, 0, 'double-release must not push active_count below zero');
});

test('untrusted forwarded IPs cannot choose their key when hops is zero', () => {
  // With hops=0, the X-Forwarded-For value is entirely attacker-controlled;
  // clientKeyFromRequest must fall back to a single "untrusted" bucket so an
  // attacker cannot spin up per-value buckets by rotating the header.
  const withHeader = (value) => ({
    headers: new Map(Object.entries(value ? { 'x-forwarded-for': value } : {})),
  });

  const a = clientKeyFromRequest(withHeader('1.2.3.4'), 'ai:chat', { trustedProxyHops: 0 });
  const b = clientKeyFromRequest(withHeader('9.9.9.9'), 'ai:chat', { trustedProxyHops: 0 });
  const c = clientKeyFromRequest(withHeader(null), 'ai:chat', { trustedProxyHops: 0 });
  assert.equal(a, b, 'attacker-controlled headers must not fragment the bucket');
  assert.equal(a, c, 'presence or absence of the header must not matter with hops=0');
  assert.match(a, /untrusted/, 'the fallback key must be recognizable in logs');
});

test('with hops=1 the rightmost forwarded value is the trusted client IP', () => {
  // nginx appends the direct peer to X-Forwarded-For with proxy_add_x_forwarded_for,
  // so any prefix an attacker set is followed by the real peer IP. The last
  // value is therefore the only trustworthy one when exactly one proxy is in
  // front of us.
  const request = { headers: new Map([['x-forwarded-for', 'attacker-lies, 10.0.0.42']]) };
  const key = clientKeyFromRequest(request, 'ai:chat', { trustedProxyHops: 1 });
  assert.equal(key, 'ai:chat:10.0.0.42');
});

test('with hops=2 the second-from-right forwarded value is the trusted client IP', () => {
  const request = {
    headers: new Map([['x-forwarded-for', 'attacker, spoofed, 10.0.0.42, edge-proxy']]),
  };
  const key = clientKeyFromRequest(request, 'ai:chat', { trustedProxyHops: 2 });
  assert.equal(key, 'ai:chat:10.0.0.42');
});

test('an X-Forwarded-For shorter than the configured hops is not trusted', () => {
  // Attacker sends a shorter header than our topology promises — we cannot
  // tell where the trusted portion begins. Fall back to the untrusted bucket
  // instead of granting the client its choice of key.
  const request = { headers: new Map([['x-forwarded-for', '1.2.3.4']]) };
  const key = clientKeyFromRequest(request, 'ai:chat', { trustedProxyHops: 3 });
  assert.match(key, /untrusted/);
});

test('rejects negative or non-integer trustedProxyHops', () => {
  const request = { headers: new Map() };
  assert.throws(() => clientKeyFromRequest(request, 'ai:chat', { trustedProxyHops: -1 }), /non-negative integer/);
  assert.throws(() => clientKeyFromRequest(request, 'ai:chat', { trustedProxyHops: 1.5 }), /non-negative integer/);
});

test('isPersistentRateLimitEnabled reads the env kill switch, defaults to off', () => {
  assert.equal(isPersistentRateLimitEnabled({}), false, 'unset must default to off so tests keep using memory');
  assert.equal(isPersistentRateLimitEnabled({ PERSISTENT_RATE_LIMIT: 'true' }), true);
  assert.equal(isPersistentRateLimitEnabled({ PERSISTENT_RATE_LIMIT: 'false' }), false);
  assert.equal(isPersistentRateLimitEnabled({ PERSISTENT_RATE_LIMIT: '1' }), true);
  assert.equal(isPersistentRateLimitEnabled({ PERSISTENT_RATE_LIMIT: '  YES  ' }), true);
});

test('the persisted subject_hash never contains the raw subject', async (t) => {
  if (!requireMysql(t)) return;
  // Everything the plan requires be pseudonymized also applies to the row
  // that lands in rate_limit_buckets — the raw subject key (an IP or actor
  // id) must not appear in any column.
  const scope = 'test:pseudonym-row';
  await clearBuckets(scope);
  const rawSubject = 'child-uuid-must-not-leak-4c1d';
  await consumePersistentBucket({
    scope, subject: rawSubject, secret: SECRET, limit: 5, windowMs: 60_000, pool,
  });
  const [rows] = await pool.query('SELECT bucket_key, subject_hash FROM rate_limit_buckets WHERE scope = ?', [scope]);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.bucket_key.includes(rawSubject), false, 'bucket_key must not contain the raw subject');
  assert.equal(row.subject_hash.includes(rawSubject), false, 'subject_hash must not contain the raw subject');
  assert.match(row.bucket_key, /^[0-9a-f]{64}$/, 'bucket_key must be a full sha256 hex');
});
