/**
 * Release regressions the happy-path journey does not reach.
 *
 * The journey proves the sequence works. These prove the gates that keep it
 * from working when it should not: the operator flag, cohort membership, guest
 * and anonymous actors, supersession, and the finality of terminal states.
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
  throw new Error(`Refusing to run release regression tests against ${DB_NAME}; database name must contain _test`);
}
process.env.MYSQL_DATABASE = DB_NAME;
process.env.AUDIT_HMAC_SECRET = process.env.AUDIT_HMAC_SECRET || 'release-regression-secret';

let pool = null;
let unavailable = null;
const projectIds = [];
const profileIds = [];
const userIds = [];

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.startsWith('@/')) return originalLoad(path.join(BUILD_ROOT, `${request.slice(2)}.js`), parent, isMain);
  return originalLoad(request, parent, isMain);
};
const { createReleaseService } = require(path.join(BUILD_ROOT, 'lib/worlds/releaseService.js'));
const { hashProjectSnapshot } = require(path.join(BUILD_ROOT, 'lib/projects/projectSnapshot.js'));
const { WORLD_RELEASE_CHECK_NAMES } = require(path.join(BUILD_ROOT, 'lib/worlds/releaseChecks.js'));
const releaseAccess = require(path.join(BUILD_ROOT, 'lib/worlds/releaseAccess.js'));
Module._load = originalLoad;

const passingChecks = WORLD_RELEASE_CHECK_NAMES.map((name) => ({ name, status: 'passed', reasonCode: null }));

function service({ flagEnabled = true } = {}) {
  return createReleaseService({
    pool,
    readFeatureFlag: () => ({
      name: 'community_publishing',
      enabled: flagEnabled,
      reason: flagEnabled ? 'flag_enabled' : 'flag_disabled',
    }),
    runWorldReleaseChecks: async () => passingChecks,
    writeAudit: async () => {},
  });
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
    for (const sql of [
      'DELETE FROM world_release_beta_cohort_members WHERE world_release_id IN (SELECT id FROM world_releases WHERE project_id = ?)',
      'DELETE FROM world_release_decisions WHERE world_release_id IN (SELECT id FROM world_releases WHERE project_id = ?)',
      'DELETE FROM world_release_checks WHERE world_release_id IN (SELECT id FROM world_releases WHERE project_id = ?)',
      'DELETE FROM world_releases WHERE project_id = ?',
      'DELETE FROM assets WHERE project_id = ?',
      'DELETE FROM project_play_snapshots WHERE project_id = ?',
      'DELETE FROM project_worlds WHERE project_id = ?',
      'DELETE FROM projects WHERE id = ?',
    ]) await pool.query(sql, [projectId]).catch(() => {});
  }
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

async function createWorldFixture(owner, { revisions = [0, 4], inCohort = true } = {}) {
  const projectId = randomUUID();
  const assetId = randomUUID();
  projectIds.push(projectId);
  await pool.query(
    `INSERT INTO projects (id, owner_id, title, description, visibility, is_published, moderation_status, revision)
     VALUES (?, ?, 'Mutable Draft', 'Private', 'private', FALSE, 'draft', ?)`,
    [projectId, owner.profileId, Math.max(...revisions)],
  );
  await pool.query(`INSERT INTO world_templates (template_id, version, catalog_metadata, active) VALUES ('platformer', 2, JSON_OBJECT(), TRUE) ON DUPLICATE KEY UPDATE active = TRUE`);
  await pool.query(`INSERT INTO project_worlds (project_id, template_id, template_version, world_metadata) VALUES (?, 'platformer', 2, JSON_OBJECT())`, [projectId]);
  await pool.query(
    `INSERT INTO assets (id, project_id, owner_id, asset_type, name, file_url, file_size, mime_type)
     VALUES (?, ?, ?, 'image', 'Cloud', '/uploads/textures/frozen.png', 512, 'image/png')`,
    [assetId, projectId, owner.profileId],
  );
  const snapshots = {};
  for (const revision of revisions) {
    const snapshot = buildPassingWorldSnapshot({ projectId, ownerId: owner.profileId, revision, title: 'Frozen Cloud Castle' });
    const id = randomUUID();
    const hash = hashProjectSnapshot(snapshot);
    await pool.query(
      `INSERT INTO project_play_snapshots (id, project_id, revision, snapshot_json, snapshot_sha256) VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, revision, JSON.stringify(snapshot), hash],
    );
    snapshots[revision] = { id, hash };
  }
  const cohortReleaseId = randomUUID();
  await pool.query(
    `INSERT INTO world_releases (id, project_id, project_play_snapshot_id, template_id, template_version, project_revision, snapshot_sha256, status, creator_label, submission_idempotency_key)
     VALUES (?, ?, ?, 'platformer', 2, 0, ?, 'rejected', 'Cohort Seed', ?)`,
    [cohortReleaseId, projectId, snapshots[0].id, snapshots[0].hash, `cohort-${randomUUID()}`],
  );
  if (inCohort) {
    await pool.query('INSERT INTO world_release_beta_cohort_members (world_release_id, profile_id) VALUES (?, ?)', [cohortReleaseId, owner.profileId]);
  }
  return { projectId, assetId, snapshots };
}

const key = () => `idem-${randomUUID()}`;

test('the operator flag gates submission and publication, and never gates withdrawal', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const fixture = await createWorldFixture(owner);

  await assert.rejects(
    () => service({ flagEnabled: false }).submitWorldRelease({ actor: owner, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: key() }),
    (error) => error.code === 'feature_unavailable' && error.status === 503,
    'submission is refused while the beta is switched off',
  );
  const [[none]] = await pool.query("SELECT COUNT(*) AS total FROM world_releases WHERE project_id = ? AND status <> 'rejected'", [fixture.projectId]);
  assert.equal(Number(none.total), 0, 'a flag-disabled submission creates no candidate');

  const candidate = await service().submitWorldRelease({ actor: owner, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: key() });
  await assert.rejects(
    () => service({ flagEnabled: false }).decideWorldRelease({ actor: admin, releaseId: candidate.id, action: 'publish' }),
    (error) => error.code === 'feature_unavailable',
    'a moderator cannot publish while the beta is switched off',
  );

  // Withdrawal must always work: an operator disabling the beta must never trap
  // a creator's world in a state they cannot leave.
  const withdrawn = await service({ flagEnabled: false }).withdrawWorldRelease({
    actor: owner, projectId: fixture.projectId, releaseId: candidate.id,
  });
  assert.equal(withdrawn.status, 'withdrawn');
});

test('cohort membership is required, and guests and anonymous actors never submit', async (t) => {
  if (!requireMysql(t)) return;
  const outsider = await createUser({ label: 'Outsider' });
  const fixture = await createWorldFixture(outsider, { inCohort: false });

  await assert.rejects(
    () => service().submitWorldRelease({ actor: outsider, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: key() }),
    (error) => error.code === 'release_cohort_forbidden' && error.status === 403,
  );

  for (const actor of [{ kind: 'anonymous' }, { kind: 'guest', profileId: randomUUID(), sessionId: randomUUID() }]) {
    await assert.rejects(
      () => service().submitWorldRelease({ actor, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: key() }),
      (error) => error.code === 'release_auth_forbidden' && error.status === 403,
      `${actor.kind} actors cannot submit`,
    );
  }
});

test('publishing a newer release supersedes the old one and leaves exactly one public', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const fixture = await createWorldFixture(owner, { revisions: [0, 4, 5] });
  const releases = service();

  // The fixture pre-seeds snapshots for both revisions; the project itself
  // starts at 4 so the first submission pins the older one.
  await pool.query('UPDATE projects SET revision = 4 WHERE id = ?', [fixture.projectId]);
  const first = await releases.submitWorldRelease({ actor: owner, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: key() });
  await releases.decideWorldRelease({ actor: admin, releaseId: first.id, action: 'publish' });
  const [[firstRow]] = await pool.query('SELECT public_slug FROM world_releases WHERE id = ?', [first.id]);
  const firstSlug = firstRow.public_slug;
  assert.ok(await releaseAccess.getPublicWorldReleaseBySlug(firstSlug));

  await pool.query('UPDATE projects SET revision = 5 WHERE id = ?', [fixture.projectId]);
  const second = await releases.submitWorldRelease({ actor: owner, projectId: fixture.projectId, expectedRevision: 5, idempotencyKey: key() });
  await releases.decideWorldRelease({ actor: admin, releaseId: second.id, action: 'publish' });

  const [rows] = await pool.query('SELECT id, status, current_public FROM world_releases WHERE project_id = ? AND id IN (?, ?)', [fixture.projectId, first.id, second.id]);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(byId[first.id].status, 'superseded');
  assert.equal(Number(byId[first.id].current_public), 0);
  assert.equal(byId[second.id].status, 'published');
  assert.equal(Number(byId[second.id].current_public), 1);
  assert.equal(rows.filter((row) => Number(row.current_public) === 1).length, 1, 'exactly one release is public');

  assert.equal(await releaseAccess.getPublicWorldReleaseBySlug(firstSlug), null, 'the superseded slug stops resolving');

  // A superseded release frees its snapshot, so that revision can be released again.
  await pool.query('UPDATE projects SET revision = 4 WHERE id = ?', [fixture.projectId]);
  const again = await releases.submitWorldRelease({ actor: owner, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: key() });
  assert.equal(again.status, 'review_pending');
});

test('terminal states are final and cannot be revived', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const releases = service();

  for (const [label, terminate] of [
    ['rejected', async (id) => releases.decideWorldRelease({ actor: admin, releaseId: id, action: 'reject', reasonCode: 'content_policy' })],
    ['withdrawn', async (id, projectId) => releases.withdrawWorldRelease({ actor: owner, projectId, releaseId: id })],
  ]) {
    const fixture = await createWorldFixture(owner);
    const candidate = await releases.submitWorldRelease({ actor: owner, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: key() });
    await terminate(candidate.id, fixture.projectId);

    await assert.rejects(
      () => releases.decideWorldRelease({ actor: admin, releaseId: candidate.id, action: 'publish' }),
      (error) => error.code === 'invalid_release_transition' && error.status === 409,
      `a ${label} release cannot be published`,
    );
    const [[row]] = await pool.query('SELECT status, current_public, public_slug FROM world_releases WHERE id = ?', [candidate.id]);
    assert.equal(row.status, label);
    assert.equal(Number(row.current_public), 0);
    assert.equal(row.public_slug, null);
  }
});

test('a taken-down release stays down and cannot be republished', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const fixture = await createWorldFixture(owner);
  const releases = service();

  const candidate = await releases.submitWorldRelease({ actor: owner, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: key() });
  await releases.decideWorldRelease({ actor: admin, releaseId: candidate.id, action: 'publish' });
  await releases.takeDownWorldRelease({ actor: admin, releaseId: candidate.id, reasonCode: 'age_safety' });

  await assert.rejects(
    () => releases.decideWorldRelease({ actor: admin, releaseId: candidate.id, action: 'publish' }),
    (error) => error.code === 'invalid_release_transition',
  );
  // A repeated takedown is a replay, not an error — moderators double-click.
  const replay = await releases.takeDownWorldRelease({ actor: admin, releaseId: candidate.id, reasonCode: 'age_safety' });
  assert.equal(replay.replayed, true);
  assert.equal(replay.status, 'taken_down');

  const [[decisions]] = await pool.query("SELECT COUNT(*) AS total FROM world_release_decisions WHERE world_release_id = ? AND decision = 'taken_down'", [candidate.id]);
  assert.equal(Number(decisions.total), 1, 'a replayed takedown does not write a second decision record');
});
