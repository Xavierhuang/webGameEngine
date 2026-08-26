/**
 * Public world release boundary — real MySQL end-to-end.
 *
 * The property under test is the one the whole beta exists to guarantee: what
 * the public can reach is a frozen snapshot, and it stops being reachable the
 * moment the release stops being current. Mocks cannot establish that, because
 * the freeze is a database identity between `world_releases` and
 * `project_play_snapshots`, not an application-layer decision.
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
  throw new Error(`Refusing to run public-boundary integration tests against ${DB_NAME}; database name must contain _test`);
}
process.env.MYSQL_DATABASE = DB_NAME;
process.env.FEATURE_FLAG_COMMUNITY_PUBLISHING = 'true';
process.env.AUDIT_HMAC_SECRET = process.env.AUDIT_HMAC_SECRET || 'release-public-boundary-secret';

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
const remixRoute = require(path.join(BUILD_ROOT, 'app/api/world-releases/[releaseId]/remix/route.js'));
const releaseAccess = require(path.join(BUILD_ROOT, 'lib/worlds/releaseAccess.js'));
const { remixWorldRelease } = require(path.join(BUILD_ROOT, 'lib/worlds/releaseRemix.js'));
const { hashProjectSnapshot } = require(path.join(BUILD_ROOT, 'lib/projects/projectSnapshot.js'));
Module._load = originalLoad;

function request(body, headers = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([n, v]) => [n.toLowerCase(), v]));
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
      database: DB_NAME, connectionLimit: 6, multipleStatements: true,
    });
    for (const name of fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
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
  for (const projectId of [...projectIds].reverse()) {
    await pool.query('UPDATE projects SET source_release_id = NULL, remixed_from = NULL WHERE id = ?', [projectId]).catch(() => {});
  }
  for (const projectId of [...projectIds].reverse()) {
    for (const sql of [
      'DELETE FROM world_release_beta_cohort_members WHERE world_release_id IN (SELECT id FROM world_releases WHERE project_id = ?)',
      'DELETE FROM world_release_decisions WHERE world_release_id IN (SELECT id FROM world_releases WHERE project_id = ?)',
      'DELETE FROM world_release_checks WHERE world_release_id IN (SELECT id FROM world_releases WHERE project_id = ?)',
      'DELETE FROM world_releases WHERE project_id = ?',
      'DELETE FROM logic_blocks WHERE project_id = ?',
      'DELETE FROM game_objects WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)',
      'DELETE FROM scenes WHERE project_id = ?',
      'DELETE FROM assets WHERE project_id = ?',
      'DELETE FROM project_play_snapshots WHERE project_id = ?',
      'DELETE FROM project_worlds WHERE project_id = ?',
      'DELETE FROM projects WHERE id = ?',
    ]) await pool.query(sql, [projectId]).catch(() => {});
  }
  await pool.query("DELETE FROM security_audit_events WHERE operation LIKE 'world_release.%'").catch(() => {});
  for (const profileId of profileIds) await pool.query('DELETE FROM profiles WHERE id = ?', [profileId]).catch(() => {});
  for (const userId of userIds) await pool.query('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
  await pool.end();
  const globalPool = globalThis.__mysqlPool;
  if (globalPool) { await globalPool.end().catch(() => {}); delete globalThis.__mysqlPool; }
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
  await pool.query(`INSERT INTO users (id, email, password_hash, email_verified) VALUES (?, ?, 'h', TRUE)`, [userId, `${userId}@example.test`]);
  await pool.query(`INSERT INTO profiles (id, user_id, profile_kind, role, display_name, birth_month) VALUES (?, ?, 'user', ?, ?, '1980-01')`, [profileId, userId, role, label]);
  return { kind: 'user', userId, profileId };
}

async function createWorldFixture(owner, revision = 4) {
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
     VALUES (?, ?, ?, 'image', 'Cloud', '/uploads/textures/frozen.png', 512, 'image/png')`,
    [assetId, projectId, owner.profileId],
  );

  const snapshots = {};
  for (const rev of [0, revision]) {
    const snapshot = buildPassingWorldSnapshot({ projectId, ownerId: owner.profileId, revision: rev, title: 'Frozen Cloud Castle' });
    // Carry one real asset so the remix has an asset row to materialize.
    snapshot.assets = [{ id: assetId, asset_type: 'image', name: 'Cloud', file_url: '/uploads/textures/frozen.png', mime_type: 'image/png', blob_checksum: null }];
    const id = randomUUID();
    const hash = hashProjectSnapshot(snapshot);
    await pool.query(
      `INSERT INTO project_play_snapshots (id, project_id, revision, snapshot_json, snapshot_sha256) VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, rev, JSON.stringify(snapshot), hash],
    );
    snapshots[rev] = { id, hash, snapshot };
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

/** Submits and publishes a candidate, returning its release id and public slug. */
async function publishRelease(owner, admin, fixture) {
  const created = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': key() }), { id: fixture.projectId }, owner);
  assert.equal(created.status, 201, `submission should reach review, got ${JSON.stringify(created.body)}`);
  const releaseId = created.body.release.id;
  if (created.body.release.status !== 'review_pending') {
    const [failed] = await pool.query(
      "SELECT check_type, status, reason_code FROM world_release_checks WHERE world_release_id = ? AND status <> 'passed'",
      [releaseId],
    );
    assert.fail(`candidate did not reach review: ${created.body.release.status}; failing checks: ${JSON.stringify(failed)}`);
  }
  const decided = await call(decisionRoute.POST, request({ action: 'publish' }), { releaseId }, admin);
  assert.equal(decided.status, 200);
  const [[row]] = await pool.query('SELECT public_slug FROM world_releases WHERE id = ?', [releaseId]);
  return { releaseId, slug: row.public_slug };
}

test('the public page reads a frozen snapshot and later private edits never reach it', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const fixture = await createWorldFixture(owner);
  const { slug } = await publishRelease(owner, admin, fixture);

  const before = await releaseAccess.getPublicWorldReleaseSnapshot(slug);
  assert.ok(before, 'a published slug resolves to a release plus its snapshot');
  assert.equal(before.release.title, 'Frozen Cloud Castle');
  assert.equal(before.snapshot.project.revision, 4);
  assert.ok(before.snapshot.scenes.length > 0, 'the public snapshot carries playable scenes');
  assert.equal(before.worldIdentity.templateId, 'platformer');

  // Mutate the private editing graph as hard as an owner can.
  await pool.query("UPDATE projects SET title = 'Renamed After Release', description = 'edited', revision = 9 WHERE id = ?", [fixture.projectId]);
  await pool.query("UPDATE assets SET name = 'Renamed Asset', file_url = '/uploads/textures/changed.png' WHERE project_id = ?", [fixture.projectId]);

  const after = await releaseAccess.getPublicWorldReleaseSnapshot(slug);
  assert.equal(after.release.title, 'Frozen Cloud Castle', 'the public title stays pinned to the snapshot');
  assert.equal(after.snapshot.project.revision, 4, 'the public snapshot stays pinned to the released revision');
  assert.deepEqual(after.snapshot, before.snapshot, 'the entire public snapshot is byte-identical after private edits');
  assert.equal(hashProjectSnapshot(after.snapshot), fixture.snapshot.hash, 'the public snapshot still hashes to the released hash');
});

test('withdrawal and takedown remove a world from every public path', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const remixer = await createUser({ label: 'Remixer' });

  for (const removal of ['withdraw', 'takedown']) {
    const fixture = await createWorldFixture(owner);
    const { releaseId, slug } = await publishRelease(owner, admin, fixture);
    assert.ok(await releaseAccess.getPublicWorldReleaseSnapshot(slug), `${removal}: reachable before removal`);

    if (removal === 'withdraw') {
      await call(withdrawRoute.POST, request({}), { id: fixture.projectId, releaseId }, owner);
    } else {
      await call(takedownRoute.POST, request({ reasonCode: 'content_policy' }), { releaseId }, admin);
    }

    assert.equal(await releaseAccess.getPublicWorldReleaseSnapshot(slug), null, `${removal}: page lookup is absent`);
    assert.equal(await releaseAccess.getPublicWorldReleaseBySlug(slug), null, `${removal}: slug lookup is absent`);
    const listed = await releaseAccess.listPublicWorldReleases({ page: 1, pageSize: 60 });
    assert.equal(listed.some((r) => r.slug === slug), false, `${removal}: absent from discovery`);

    const remixAttempt = await call(remixRoute.POST, request({}), { releaseId }, remixer);
    assert.equal(remixAttempt.status, 404, `${removal}: remix is refused`);
  }
});

test('remix materializes the frozen snapshot into a new private project, not the live graph', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const remixer = await createUser({ label: 'Remixer' });
  const fixture = await createWorldFixture(owner);
  const { releaseId, slug } = await publishRelease(owner, admin, fixture);

  // Change the live graph first: anything the remix copies from live rows
  // instead of the snapshot will show up as the edited value.
  await pool.query("UPDATE projects SET title = 'Live Graph Edited', revision = 12 WHERE id = ?", [fixture.projectId]);

  const response = await call(remixRoute.POST, request({}), { releaseId }, remixer);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const remixProjectId = response.body.project.id;
  projectIds.push(remixProjectId);

  const [[project]] = await pool.query(
    'SELECT owner_id, title, visibility, is_published, moderation_status, remixed_from, source_release_id, revision FROM projects WHERE id = ?',
    [remixProjectId],
  );
  assert.equal(project.owner_id, remixer.profileId, 'the remix belongs to the remixer');
  assert.equal(project.visibility, 'private', 'a remix always starts private');
  assert.equal(Number(project.is_published), 0);
  assert.equal(project.moderation_status, 'draft');
  assert.equal(project.remixed_from, fixture.projectId);
  assert.equal(project.source_release_id, releaseId);
  assert.match(project.title, /^Frozen Cloud Castle/, 'the remix title comes from the frozen snapshot, not the edited live row');
  assert.doesNotMatch(project.title, /Live Graph Edited/);

  // World identity, scenes, objects, and blocks all come from the snapshot.
  const [[world]] = await pool.query('SELECT template_id, template_version FROM project_worlds WHERE project_id = ?', [remixProjectId]);
  assert.deepEqual({ id: world.template_id, version: Number(world.template_version) }, { id: 'platformer', version: 2 });

  const source = fixture.snapshot.snapshot;
  const [scenes] = await pool.query('SELECT id, name, order_index FROM scenes WHERE project_id = ? ORDER BY order_index', [remixProjectId]);
  assert.equal(scenes.length, source.scenes.length);
  assert.deepEqual(scenes.map((s) => s.name), source.scenes.map((s) => s.name));

  const [[objectCount]] = await pool.query(
    'SELECT COUNT(*) AS total FROM game_objects WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)', [remixProjectId]);
  assert.equal(Number(objectCount.total), source.scenes.flatMap((s) => s.objects).length);

  const [[blockCount]] = await pool.query('SELECT COUNT(*) AS total FROM logic_blocks WHERE project_id = ?', [remixProjectId]);
  assert.equal(Number(blockCount.total), source.scenes.flatMap((s) => s.objects).flatMap((o) => o.logic_blocks).length);

  const [assets] = await pool.query('SELECT owner_id, name, file_url, file_size FROM assets WHERE project_id = ?', [remixProjectId]);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].owner_id, remixer.profileId);
  assert.equal(assets[0].file_url, '/uploads/textures/frozen.png', 'the asset URL comes from the snapshot');

  // Every copied row must be a new identity, never a shared primary key.
  const [[collision]] = await pool.query(
    'SELECT COUNT(*) AS total FROM scenes WHERE project_id = ? AND id IN (SELECT id FROM scenes WHERE project_id = ?)',
    [remixProjectId, fixture.projectId],
  );
  assert.equal(Number(collision.total), 0, 'a remix shares no row identity with its source');

  // The source project keeps its private graph; only the counter moves.
  const [[sourceAfter]] = await pool.query('SELECT title, revision, remix_count FROM projects WHERE id = ?', [fixture.projectId]);
  assert.equal(sourceAfter.title, 'Live Graph Edited', 'remixing never rewrites the source project');
  assert.equal(Number(sourceAfter.revision), 12);
  assert.equal(Number(sourceAfter.remix_count), 1, 'the source remix counter advances exactly once');

  // The published release still serves the original frozen snapshot.
  const stillPublic = await releaseAccess.getPublicWorldReleaseSnapshot(slug);
  assert.equal(hashProjectSnapshot(stillPublic.snapshot), fixture.snapshot.hash);
});

test('remix refuses anonymous callers and unknown releases without disclosing which', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const fixture = await createWorldFixture(owner);
  const { releaseId } = await publishRelease(owner, admin, fixture);

  const anonymous = await call(remixRoute.POST, request({}), { releaseId }, { kind: 'anonymous' });
  assert.equal(anonymous.status, 401);

  const unknown = await call(remixRoute.POST, request({}), { releaseId: randomUUID() }, owner);
  assert.equal(unknown.status, 404);

  // A candidate that has never been published is not remixable either.
  const pendingFixture = await createWorldFixture(owner);
  const pending = await call(releasesRoute.POST, request({ expectedRevision: 4 }, { 'Idempotency-Key': key() }), { id: pendingFixture.projectId }, owner);
  const pendingRemix = await call(remixRoute.POST, request({}), { releaseId: pending.body.release.id }, owner);
  assert.equal(pendingRemix.status, 404, 'a release awaiting review is not public and not remixable');
});

test('a guest can remix a published world and the copy is theirs and private', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const fixture = await createWorldFixture(owner);
  const { releaseId } = await publishRelease(owner, admin, fixture);

  const guestProfileId = randomUUID();
  profileIds.push(guestProfileId);
  await pool.query(`INSERT INTO profiles (id, user_id, profile_kind, role, display_name) VALUES (?, NULL, 'guest', 'child', 'Guest Builder')`, [guestProfileId]);
  const guest = { kind: 'guest', profileId: guestProfileId, sessionId: randomUUID() };

  const result = await remixWorldRelease({ actor: guest, releaseId });
  projectIds.push(result.project.id);
  const [[project]] = await pool.query('SELECT owner_id, visibility FROM projects WHERE id = ?', [result.project.id]);
  assert.equal(project.owner_id, guestProfileId, 'a guest with a profile owns their remix');
  assert.equal(project.visibility, 'private');
});
