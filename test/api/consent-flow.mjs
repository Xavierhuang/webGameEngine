/**
 * Parental-consent state machine — real MySQL end-to-end.
 *
 * Task 5 tightened the token-leak surface: the child never sees a consent
 * URL, the child API never echoes a token, sibling tokens for the same
 * child atomically expire on every state change, and the profile
 * permission flip rides the same transaction as the decision write.
 *
 * The integration below drives the actual `parentalConsent.ts` module
 * against `gameengine_test`. A pure-JS mock would not catch the
 * transactional invariants (which are what Task 5 is FOR), so this suite
 * skips loudly rather than falling back to mocks when MySQL is not
 * reachable.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import {
  createConsentRequest,
  loadConsentStatus,
  resolveConsent,
  resendConsentRequest,
  hashToken,
} from '../.build/lib/safety/parentalConsent.js';

const DB_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASSWORD = process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.MYSQL_DATABASE || 'gameengine_test';

if (!DB_NAME.includes('_test')) {
  throw new Error(
    `Refusing to run destructive consent-flow tests against ${DB_NAME}; ` +
      'database name must contain _test',
  );
}

let pool = null;
let mysqlUnavailableReason = null;
const profilesCreated = [];

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
  if (pool) {
    for (const profileId of profilesCreated) {
      await pool.query('DELETE FROM parental_consents WHERE child_profile_id = ?', [profileId]).catch(() => {});
      await pool.query('DELETE FROM profiles WHERE id = ?', [profileId]).catch(() => {});
    }
    await pool.end();
  }
});

function requireMysql(t) {
  if (!pool) {
    t.skip(`MySQL not reachable: ${mysqlUnavailableReason}`);
    return false;
  }
  return true;
}

async function makeChildProfile() {
  const profileId = randomUUID();
  await pool.query(
    "INSERT INTO profiles (id, user_id, profile_kind, display_name, role, age, birth_month) VALUES (?, NULL, 'guest', 'consent test', 'child', 10, '2015-05')",
    [profileId],
  );
  profilesCreated.push(profileId);
  return profileId;
}

test('createConsentRequest issues a hashed token and never stores the raw value', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeChildProfile();
  const { token, consentId, expiresAt } = await createConsentRequest(profileId, 'parent@example.com');
  assert.ok(token && token.length >= 32);
  assert.ok(expiresAt.getTime() > Date.now());

  const [rows] = await pool.query('SELECT token_hash FROM parental_consents WHERE id = ?', [consentId]);
  assert.equal(rows.length, 1);
  const storedHash = rows[0].token_hash;
  assert.notEqual(storedHash, token, 'raw token must never land in the row');
  assert.equal(storedHash, hashToken(token), 'stored hash must be the derived digest');
});

test('a second createConsentRequest atomically expires the first — no two pending rows', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeChildProfile();
  const first = await createConsentRequest(profileId, 'parent@example.com');
  const second = await createConsentRequest(profileId, 'parent@example.com');

  const [rows] = await pool.query(
    'SELECT id, status FROM parental_consents WHERE child_profile_id = ? ORDER BY created_at ASC',
    [profileId],
  );
  assert.equal(rows.length, 2);
  const older = rows.find((r) => r.id === first.consentId);
  const newer = rows.find((r) => r.id === second.consentId);
  assert.equal(older.status, 'expired', 'older token must be expired atomically');
  assert.equal(newer.status, 'pending', 'newer token is the only pending one');
});

test('grant flips profile permissions in the same transaction — no divergence', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeChildProfile();
  const { token } = await createConsentRequest(profileId, 'parent@example.com');

  const outcome = await resolveConsent(token, 'granted');
  assert.equal(outcome.ok, true);

  const [rows] = await pool.query(
    'SELECT parental_approval, can_share, can_publish FROM profiles WHERE id = ?',
    [profileId],
  );
  assert.equal(Number(rows[0].parental_approval), 1, 'parental_approval must flip to 1');
  assert.equal(Number(rows[0].can_share), 1, 'can_share must flip to 1');
  assert.equal(Number(rows[0].can_publish), 1, 'can_publish must flip to 1');
});

test('deny records the decision but leaves the profile unable to share', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeChildProfile();
  const { token } = await createConsentRequest(profileId, 'parent@example.com');
  await resolveConsent(token, 'denied');

  const [rows] = await pool.query(
    'SELECT parental_approval, can_share FROM profiles WHERE id = ?',
    [profileId],
  );
  assert.equal(Number(rows[0].parental_approval), 0);
  assert.equal(Number(rows[0].can_share), 0);

  const [tokenRows] = await pool.query(
    'SELECT status FROM parental_consents WHERE child_profile_id = ?',
    [profileId],
  );
  assert.equal(tokenRows[0].status, 'denied');
});

test('resolving a token atomically expires every sibling pending token for the same child', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeChildProfile();
  // First token — will be the "older" resend candidate.
  const first = await createConsentRequest(profileId, 'parent@example.com');
  // Second token — will be the one the parent uses.
  const second = await createConsentRequest(profileId, 'parent@example.com');
  // First is already expired by the second's transaction (asserted
  // above). Confirm resolving the second also cleans up any straggler.
  await resolveConsent(second.token, 'granted');

  const [rows] = await pool.query(
    'SELECT id, status FROM parental_consents WHERE child_profile_id = ? ORDER BY created_at ASC',
    [profileId],
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.id === first.consentId).status, 'expired');
  assert.equal(rows.find((r) => r.id === second.consentId).status, 'granted');
});

test('a superseded (older) token cannot grant consent even if replayed', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeChildProfile();
  const first = await createConsentRequest(profileId, 'parent@example.com');
  // Resend supersedes the first.
  await createConsentRequest(profileId, 'parent@example.com');

  const outcome = await resolveConsent(first.token, 'granted');
  assert.equal(outcome.ok, false, 'superseded token must not grant');
  assert.equal(outcome.reason, 'already-answered');
});

test('loadConsentStatus reports pending → granted transitions without leaking the token', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeChildProfile();
  const pre = await loadConsentStatus(profileId);
  assert.equal(pre.state, 'not_required');

  const { token } = await createConsentRequest(profileId, 'parent@example.com');
  const pending = await loadConsentStatus(profileId);
  assert.equal(pending.state, 'pending');
  assert.equal(pending.parentEmail, 'parent@example.com');
  assert.equal(JSON.stringify(pending).includes(token), false, 'status must never contain the raw token');

  await resolveConsent(token, 'granted');
  const granted = await loadConsentStatus(profileId);
  assert.equal(granted.state, 'granted');
});

test('resendConsentRequest respects the 5-minute cooldown', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeChildProfile();
  await createConsentRequest(profileId, 'parent@example.com');

  const rejected = await resendConsentRequest(profileId);
  assert.equal(rejected.ok, false, 'immediate resend must be blocked by cooldown');
  assert.equal(rejected.reason, 'cooldown');
});

test('resendConsentRequest refuses when consent is already granted', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeChildProfile();
  const { token } = await createConsentRequest(profileId, 'parent@example.com');
  await resolveConsent(token, 'granted');

  const rejected = await resendConsentRequest(profileId);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'already-answered');
});

test('resolveConsent on a bogus token reports not-found without leaking DB state', async (t) => {
  if (!requireMysql(t)) return;
  const outcome = await resolveConsent('deadbeef'.repeat(8), 'granted');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'not-found');
});
