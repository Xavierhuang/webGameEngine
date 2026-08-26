/**
 * World release route handlers — real MySQL end-to-end.
 *
 * The unit suite in `world-release-routes.test.js` stubs the service to pin the
 * HTTP contract. This one drives the compiled route handlers over the real
 * `releaseService` and a real `gameengine_test` database, because the things
 * worth protecting here — that a stranger's 404 is indistinguishable from an
 * absent project, that a non-admin cannot decide, that submission is idempotent
 * across two HTTP calls — are all properties of the service transaction, not of
 * the adapter. Only `resolveActor` is replaced; there is no HTTP layer to carry
 * a session.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { buildPassingWorldSnapshot } from '../helpers/world-release-fixture.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BUILD_ROOT = path.join(ROOT, 'test/.build');
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const Module = require('node:module');

const DB_NAME = process.env.MYSQL_DATABASE || 'gameengine_test';
if (!DB_NAME.includes('_test')) {
  throw new Error(`Refusing to run release-route integration tests against ${DB_NAME}; database name must contain _test`);
}
// The compiled service reads its pool and flag state from the environment.
process.env.MYSQL_DATABASE = DB_NAME;
process.env.FEATURE_FLAG_COMMUNITY_PUBLISHING = 'true';
process.env.AUDIT_HMAC_SECRET = process.env.AUDIT_HMAC_SECRET || 'release-route-integration-secret';

let pool = null;
let unavailable = null;
let currentActor = { kind: 'anonymous' };
const projectIds = [];
const profileIds = [];
const userIds = [];

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/auth/actor') return { resolveActor: async () => currentActor };
  if (request.startsWith('@/')) return originalLoad(path.join(BUILD_ROOT, `${request.slice(2)}.js`), parent, isMain);
  return originalLoad(request, parent, isMain);
};
const releasesRoute = require(path.join(BUILD_ROOT, 'app/api/projects/[id]/world-releases/route.js'));
const withdrawRoute = require(path.join(BUILD_ROOT, 'app/api/projects/[id]/world-releases/[releaseId]/withdraw/route.js'));
const decisionRoute = require(path.join(BUILD_ROOT, 'app/api/admin/world-releases/[releaseId]/decision/route.js'));
const takedownRoute = require(path.join(BUILD_ROOT, 'app/api/admin/world-releases/[releaseId]/takedown/route.js'));
Module._load = originalLoad;

function request(body, headers = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  return {
    headers: { get: (name) => normalized[name.toLowerCase()] ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  };
}

const params = (value) => ({ params: Promise.resolve(value) });

async function call(handler, req, routeParams, actor) {
  currentActor = actor;
  const response = await handler(req, params(routeParams));
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  try {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: DB_NAME,
      connectionLimit: 6,
      multipleStatements: true,
    });
    for (const name of fs.readdirSync(path.join(ROOT, 'migrations')).filter((file) => file.endsWith('.sql')).sort()) {
      let migration = fs.readFileSync(path.join(ROOT, 'migrations', name), 'utf8').replace(/^USE gameengine;\s*$/m, '');
      if (name === '001_initial_schema.sql') {
        migration = migration.replace(/-- Trigger to auto-create profile when user is created[\s\S]*?DELIMITER ;\s*/m, '');
      }
      await pool.query(migration);
    }
    await pool.query('DROP TRIGGER IF EXISTS after_user_insert');
    await pool.query('SELECT 1 FROM world_releases LIMIT 1');
  } catch (error) {
    unavailable = error instanceof Error ? error.message : String(error);
    await pool?.end().catch(() => {});
    pool = null;
  }
});

test.after(async () => {
  if (!pool) return;
  for (const projectId of projectIds) {
    await pool.query('DELETE FROM world_release_beta_cohort_members WHERE world_release_id IN (SELECT id FROM world_releases WHERE project_id = ?)', [projectId]).catch(() => {});
    await pool.query('DELETE FROM world_release_decisions WHERE world_release_id IN (SELECT id FROM world_releases WHERE project_id = ?)', [projectId]).catch(() => {});
    await pool.query('DELETE FROM world_release_checks WHERE world_release_id IN (SELECT id FROM world_releases WHERE project_id = ?)', [projectId]).catch(() => {});
    await pool.query('DELETE FROM world_releases WHERE project_id = ?', [projectId]).catch(() => {});
    await pool.query('DELETE FROM assets WHERE project_id = ?', [projectId]).catch(() => {});
    await pool.query('DELETE FROM project_play_snapshots WHERE project_id = ?', [projectId]).catch(() => {});
    await pool.query('DELETE FROM project_worlds WHERE project_id = ?', [projectId]).catch(() => {});
    await pool.query('DELETE FROM projects WHERE id = ?', [projectId]).catch(() => {});
  }
  for (const profileId of profileIds) {
    await pool.query('DELETE FROM security_audit_events WHERE actor_id IS NOT NULL AND operation LIKE ?', ['world_release.%']).catch(() => {});
    await pool.query('DELETE FROM profiles WHERE id = ?', [profileId]).catch(() => {});
  }
  for (const userId of userIds) await pool.query('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
  await pool.end();
  // The compiled service opens its own module-global pool via `getPool()`.
  // Without closing it the test process keeps a live socket and never exits.
  const globalPool = globalThis.__mysqlPool;
  if (globalPool) {
    await globalPool.end().catch(() => {});
    delete globalThis.__mysqlPool;
  }
});

function requireMysql(t) {
  if (pool) return true;
  t.skip(`MySQL not reachable or release schema unavailable: ${unavailable}`);
  return false;
}

async function createUser({ role = 'child', label = 'World Builder' } = {}) {
  const userId = randomUUID();
  const profileId = randomUUID();
  userIds.push(userId);
  profileIds.push(profileId);
  await pool.query(`INSERT INTO users (id, email, password_hash, email_verified) VALUES (?, ?, 'test-hash', TRUE)`, [userId, `${userId}@example.test`]);
  await pool.query(
    `INSERT INTO profiles (id, user_id, profile_kind, role, display_name, birth_month) VALUES (?, ?, 'user', ?, ?, '1980-01')`,
    [profileId, userId, role, label],
  );
  return { kind: 'user', userId, profileId };
}

async function createWorldFixture(owner, revision = 4) {
  const { hashProjectSnapshot } = require(path.join(BUILD_ROOT, 'lib/projects/projectSnapshot.js'));
  const projectId = randomUUID();
  const assetId = randomUUID();
  projectIds.push(projectId);
  await pool.query(
    `INSERT INTO projects (id, owner_id, title, description, visibility, is_published, moderation_status, revision)
     VALUES (?, ?, 'Mutable Draft', 'Private editing graph', 'private', FALSE, 'draft', ?)`,
    [projectId, owner.profileId, revision],
  );
  await pool.query(`INSERT INTO world_templates (template_id, version, catalog_metadata, active) VALUES ('platformer', 2, JSON_OBJECT(), TRUE) ON DUPLICATE KEY UPDATE active = TRUE`);
  await pool.query(`INSERT INTO project_worlds (project_id, template_id, template_version, world_metadata) VALUES (?, 'platformer', 2, JSON_OBJECT())`, [projectId]);
  await pool.query(
    `INSERT INTO assets (id, project_id, owner_id, asset_type, name, file_url, file_size, mime_type)
     VALUES (?, ?, ?, 'image', 'Cloud', '/assets/frozen.png', 512, 'image/png')`,
    [assetId, projectId, owner.profileId],
  );

  const snapshots = {};
  for (const rev of [0, revision]) {
    // Built from the live catalog template so the candidate actually passes
    // every fixed release check and reaches `review_pending`, the state the
    // publish and takedown paths below depend on.
    const snapshot = buildPassingWorldSnapshot({
      projectId, ownerId: owner.profileId, revision: rev, title: 'Frozen Cloud Castle',
    });
    const id = randomUUID();
    const hash = hashProjectSnapshot(snapshot);
    await pool.query(
      `INSERT INTO project_play_snapshots (id, project_id, revision, snapshot_json, snapshot_sha256) VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, rev, JSON.stringify(snapshot), hash],
    );
    snapshots[rev] = { id, hash };
  }

  const cohortReleaseId = randomUUID();
  await pool.query(
    `INSERT INTO world_releases (id, project_id, project_play_snapshot_id, template_id, template_version, project_revision, snapshot_sha256, status, creator_label, submission_idempotency_key)
     VALUES (?, ?, ?, 'platformer', 2, 0, ?, 'rejected', 'Cohort Seed', ?)`,
    [cohortReleaseId, projectId, snapshots[0].id, snapshots[0].hash, `cohort-${randomUUID()}`],
  );
  await pool.query('INSERT INTO world_release_beta_cohort_members (world_release_id, profile_id) VALUES (?, ?)', [cohortReleaseId, owner.profileId]);
  return { projectId, assetId, snapshot: snapshots[revision] };
}

const key = () => `idem-${randomUUID()}`;

test('the owner route submits, replays, and reports history while a stranger sees only 404', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const stranger = await createUser({ label: 'Stranger' });
  const fixture = await createWorldFixture(owner);
  const idempotencyKey = key();

  const created = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': idempotencyKey }), { id: fixture.projectId }, owner);
  assert.equal(created.status, 201);
  assert.equal(created.body.release.status, 'review_pending');
  assert.equal(created.body.release.replayed, false);

  // The same key over a second HTTP call must not mint a second candidate.
  const replayed = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': idempotencyKey }), { id: fixture.projectId }, owner);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.body.release.id, created.body.release.id);
  assert.equal(replayed.body.release.replayed, true);
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM world_releases WHERE project_id = ? AND submission_idempotency_key = ?', [fixture.projectId, idempotencyKey]);
  assert.equal(Number(total), 1);

  const history = await call(releasesRoute.GET, request(), { id: fixture.projectId }, owner);
  assert.equal(history.status, 200);
  const submitted = history.body.releases.find((release) => release.id === created.body.release.id);
  assert.equal(submitted.status, 'review_pending');
  assert.equal(submitted.sourceRevision, 4);
  assert.ok(submitted.checks.length > 0, 'the owner sees their automated check summary');

  // No reviewer identity, moderator reason, or consent field may cross the boundary.
  assert.doesNotMatch(
    JSON.stringify(history.body),
    /decision_reason_code|reviewer_profile_id|parent_email|birth_month|moderation_notes/,
  );

  const strangerHistory = await call(releasesRoute.GET, request(), { id: fixture.projectId }, stranger);
  assert.deepEqual(strangerHistory, { status: 404, body: { error: 'release_not_found' } });
  const absentHistory = await call(releasesRoute.GET, request(), { id: randomUUID() }, stranger);
  assert.deepEqual(absentHistory, strangerHistory, 'a project you do not own is indistinguishable from one that is absent');

  const strangerSubmit = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': key() }), { id: fixture.projectId }, stranger);
  assert.equal(strangerSubmit.status, 404);
});

test('only an admin can decide, and a published release can be taken down', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const fixture = await createWorldFixture(owner);

  const created = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': key() }), { id: fixture.projectId }, owner);
  assert.equal(created.status, 201);
  const releaseId = created.body.release.id;

  const ownerDecision = await call(decisionRoute.POST, request({ action: 'publish' }), { releaseId }, owner);
  assert.deepEqual(ownerDecision, { status: 403, body: { error: 'release_auth_forbidden' } });
  const [[stillPending]] = await pool.query('SELECT status FROM world_releases WHERE id = ?', [releaseId]);
  assert.equal(stillPending.status, 'review_pending');

  const published = await call(decisionRoute.POST, request({ action: 'publish' }), { releaseId }, admin);
  assert.equal(published.status, 200);
  assert.equal(published.body.release.status, 'published');
  const [[live]] = await pool.query('SELECT status, current_public, public_slug FROM world_releases WHERE id = ?', [releaseId]);
  assert.equal(live.status, 'published');
  assert.equal(Number(live.current_public), 1);
  assert.match(live.public_slug, /^wr_[0-9a-f]{32}$/);

  const ownerTakedown = await call(takedownRoute.POST, request({ reasonCode: 'content_policy' }), { releaseId }, owner);
  assert.equal(ownerTakedown.status, 403);

  const removed = await call(takedownRoute.POST, request({ reasonCode: 'content_policy' }), { releaseId }, admin);
  assert.equal(removed.status, 200);
  const [[down]] = await pool.query('SELECT status, current_public, public_slug FROM world_releases WHERE id = ?', [releaseId]);
  assert.deepEqual(
    { status: down.status, currentPublic: Number(down.current_public), slug: down.public_slug },
    { status: 'taken_down', currentPublic: 0, slug: null },
  );
});

test('withdrawal is owner-only and frees the revision for a fresh submission', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const stranger = await createUser({ label: 'Stranger' });
  const fixture = await createWorldFixture(owner);

  const created = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': key() }), { id: fixture.projectId }, owner);
  const releaseId = created.body.release.id;

  const strangerWithdraw = await call(withdrawRoute.POST, request({}), { id: fixture.projectId, releaseId }, stranger);
  assert.deepEqual(strangerWithdraw, { status: 404, body: { error: 'release_not_found' } });

  // A live candidate still holds its snapshot.
  const duplicate = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': key() }), { id: fixture.projectId }, owner);
  assert.deepEqual(duplicate, { status: 409, body: { error: 'release_already_in_flight' } });

  const withdrawn = await call(withdrawRoute.POST, request({}), { id: fixture.projectId, releaseId }, owner);
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.release.status, 'withdrawn');

  const resubmitted = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': key() }), { id: fixture.projectId }, owner);
  assert.equal(resubmitted.status, 201, 'the same revision can be resubmitted once the prior candidate is withdrawn');
  assert.notEqual(resubmitted.body.release.id, releaseId);
});

test('a stale expected revision conflicts instead of releasing the wrong snapshot', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const fixture = await createWorldFixture(owner);

  const stale = await call(releasesRoute.POST, request({ expectedRevision: 3 }, { 'Idempotency-Key': key() }), { id: fixture.projectId }, owner);
  assert.deepEqual(stale, { status: 409, body: { error: 'revision_conflict' } });
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM world_releases WHERE project_id = ? AND status <> 'rejected'", [fixture.projectId]);
  assert.equal(Number(total), 0, 'a stale submission creates no candidate at all');
});

test('the release audit trail records fixed codes and never a raw actor identity', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const fixture = await createWorldFixture(owner);

  await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': key() }), { id: fixture.projectId }, owner);
  const [events] = await pool.query(
    "SELECT actor_kind, actor_id, operation, outcome, reason_code FROM security_audit_events WHERE operation = 'world_release.submitted' ORDER BY created_at DESC LIMIT 1",
  );
  assert.equal(events.length, 1, 'submission writes exactly one audit receipt');
  const [event] = events;
  assert.equal(event.actor_kind, 'user');
  assert.equal(event.operation, 'world_release.submitted');
  assert.equal(event.outcome, 'allowed');
  assert.equal(event.reason_code, 'review_pending');
  assert.notEqual(event.actor_id, owner.profileId, 'the raw profile ID is never stored');
  assert.notEqual(event.actor_id, owner.userId, 'the raw user ID is never stored');
  assert.match(event.actor_id, /^[0-9a-f]{32}$/, 'the actor is stored as a pseudonym');
});

test('the public release listers run against real MySQL, not only a stubbed driver', async (t) => {
  if (!requireMysql(t)) return;
  // Regression guard: `LIMIT ?` / `OFFSET ?` cannot be bound through the
  // prepared-statement protocol these helpers use, so a unit test with a
  // stubbed driver will pass while every real Explore query returns
  // ER_WRONG_ARGUMENTS. Exercise both readers against the real database.
  const { listPublicWorldReleases, getPublicWorldReleaseBySlug } = require(path.join(BUILD_ROOT, 'lib/worlds/releaseAccess.js'));

  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const fixture = await createWorldFixture(owner);
  const created = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': key() }), { id: fixture.projectId }, owner);
  const releaseId = created.body.release.id;
  await call(decisionRoute.POST, request({ action: 'publish' }), { releaseId }, admin);
  const [[{ public_slug: slug }]] = await pool.query('SELECT public_slug FROM world_releases WHERE id = ?', [releaseId]);

  for (const options of [undefined, {}, { page: 1, pageSize: 5 }, { page: 3, pageSize: 60 }, { page: -1, pageSize: 0 }]) {
    const listed = await listPublicWorldReleases(options);
    assert.ok(Array.isArray(listed), `listPublicWorldReleases(${JSON.stringify(options)}) must return rows`);
  }

  const firstPage = await listPublicWorldReleases({ page: 1, pageSize: 24 });
  const mine = firstPage.find((release) => release.slug === slug);
  assert.ok(mine, 'a freshly published release appears in the public listing');
  assert.equal(mine.title, 'Frozen Cloud Castle');
  assert.doesNotMatch(JSON.stringify(mine), /status|current_public|owner_id|submission_idempotency_key/);

  const bySlug = await getPublicWorldReleaseBySlug(slug);
  assert.equal(bySlug.id, releaseId);
  assert.equal(await getPublicWorldReleaseBySlug('wr_does_not_exist'), null);

  // Removal must drop it from both readers.
  await call(takedownRoute.POST, request({ reasonCode: 'content_policy' }), { releaseId }, admin);
  assert.equal(await getPublicWorldReleaseBySlug(slug), null, 'a taken-down release is no longer resolvable');
  const afterRemoval = await listPublicWorldReleases({ page: 1, pageSize: 24 });
  assert.equal(afterRemoval.some((release) => release.slug === slug), false, 'a taken-down release leaves the public listing');
});
