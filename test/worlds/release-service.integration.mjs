import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const ts = require('typescript');
const Module = require('node:module');
Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const { createReleaseService } = require('../../lib/worlds/releaseService.ts');
const { hashProjectSnapshot } = require('../../lib/projects/projectSnapshot.ts');
const { WORLD_RELEASE_CHECK_NAMES } = require('../../lib/worlds/releaseChecks.ts');

const DB_NAME = process.env.MYSQL_DATABASE || 'gameengine_test';
if (!DB_NAME.includes('_test')) {
  throw new Error(`Refusing to run release-service integration tests against ${DB_NAME}; database name must contain _test`);
}

let pool = null;
let unavailable = null;
const projectIds = [];
const profileIds = [];
const userIds = [];

const passingChecks = WORLD_RELEASE_CHECK_NAMES.map((name) => ({ name, status: 'passed', reasonCode: null }));

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
    // The repository's migrations are written with `USE gameengine` because
    // the production setup process launches a fresh mysql client per file.
    // These integration tests stay inside the guarded `_test` database, so
    // remove only that selector and run the same ordered schema contract.
    for (const name of fs.readdirSync('migrations').filter((file) => file.endsWith('.sql')).sort()) {
      let migration = fs.readFileSync(`migrations/${name}`, 'utf8').replace(/^USE gameengine;\s*$/m, '');
      // `mysql` CLI understands DELIMITER, but the driver does not. The one
      // trigger is unrelated to release authority and auto-creates profiles,
      // which would invalidate explicit test identities, so leave it to the
      // production migration path and test the same tables without it.
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
  for (const profileId of profileIds) await pool.query('DELETE FROM profiles WHERE id = ?', [profileId]).catch(() => {});
  for (const userId of userIds) await pool.query('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
  await pool.end();
});

function requireMysql(t) {
  if (pool) return true;
  t.skip(`MySQL not reachable or release schema unavailable: ${unavailable}`);
  return false;
}

async function createUser({ role = 'child', birthMonth = '1980-01', label = 'World Builder' } = {}) {
  const userId = randomUUID();
  const profileId = randomUUID();
  userIds.push(userId);
  profileIds.push(profileId);
  await pool.query(
    `INSERT INTO users (id, email, password_hash, email_verified)
     VALUES (?, ?, 'test-hash', TRUE)`,
    [userId, `${userId}@example.test`],
  );
  await pool.query(
    `INSERT INTO profiles (id, user_id, profile_kind, role, display_name, birth_month)
     VALUES (?, ?, 'user', ?, ?, ?)`,
    [profileId, userId, role, label, birthMonth],
  );
  return { kind: 'user', userId, profileId };
}

function snapshotFor({ projectId, ownerId, revision, assetId }) {
  return {
    project: {
      id: projectId, owner_id: ownerId, title: 'Frozen Cloud Castle', description: 'A private snapshot.',
      thumbnail_url: '/assets/frozen.png', visibility: 'private', genre: 'platformer',
      is_published: false, moderation_status: 'draft', revision,
    },
    scenes: [],
    assets: [{
      id: assetId, asset_type: 'image', name: 'Cloud', file_url: '/assets/frozen.png',
      mime_type: 'image/png', blob_checksum: null,
    }],
  };
}

async function insertSnapshot({ projectId, ownerId, revision, assetId }) {
  const snapshot = snapshotFor({ projectId, ownerId, revision, assetId });
  const id = randomUUID();
  const hash = hashProjectSnapshot(snapshot);
  await pool.query(
    `INSERT INTO project_play_snapshots (id, project_id, revision, snapshot_json, snapshot_sha256)
     VALUES (?, ?, ?, ?, ?)`,
    [id, projectId, revision, JSON.stringify(snapshot), hash],
  );
  return { id, hash, snapshot };
}

async function createWorldFixture({ owner, revision = 4, withGrantedConsent = false }) {
  const projectId = randomUUID();
  const assetId = randomUUID();
  projectIds.push(projectId);
  await pool.query(
    `INSERT INTO projects
       (id, owner_id, title, description, visibility, is_published, moderation_status, revision)
     VALUES (?, ?, 'Mutable Draft', 'Private editing graph', 'private', FALSE, 'draft', ?)`,
    [projectId, owner.profileId, revision],
  );
  await pool.query(
    `INSERT INTO world_templates (template_id, version, catalog_metadata, active)
     VALUES ('platformer', 2, JSON_OBJECT(), TRUE)
     ON DUPLICATE KEY UPDATE active = TRUE`,
  );
  await pool.query(
    `INSERT INTO project_worlds (project_id, template_id, template_version, world_metadata)
     VALUES (?, 'platformer', 2, JSON_OBJECT())`,
    [projectId],
  );
  await pool.query(
    `INSERT INTO assets (id, project_id, owner_id, asset_type, name, file_url, file_size, mime_type)
     VALUES (?, ?, ?, 'image', 'Cloud', '/assets/frozen.png', 512, 'image/png')`,
    [assetId, projectId, owner.profileId],
  );
  const seed = await insertSnapshot({ projectId, ownerId: owner.profileId, revision: 0, assetId });
  const current = await insertSnapshot({ projectId, ownerId: owner.profileId, revision, assetId });
  const cohortReleaseId = randomUUID();
  await pool.query(
    `INSERT INTO world_releases
       (id, project_id, project_play_snapshot_id, template_id, template_version, project_revision,
        snapshot_sha256, status, creator_label, submission_idempotency_key)
     VALUES (?, ?, ?, 'platformer', 2, 0, ?, 'rejected', 'Cohort Seed', ?)`,
    [cohortReleaseId, projectId, seed.id, seed.hash, `cohort-${randomUUID()}`],
  );
  await pool.query(
    'INSERT INTO world_release_beta_cohort_members (world_release_id, profile_id) VALUES (?, ?)',
    [cohortReleaseId, owner.profileId],
  );
  if (withGrantedConsent) {
    await pool.query(
      `INSERT INTO parental_consents (id, child_profile_id, parent_email, token_hash, status, expires_at)
       VALUES (?, ?, 'parent@example.test', ?, 'granted', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY))`,
      [randomUUID(), owner.profileId, randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')],
    );
  }
  return { projectId, assetId, snapshot: current };
}

function service() {
  return createReleaseService({
    pool,
    readFeatureFlag: () => ({ name: 'community_publishing', enabled: true, reason: 'flag_enabled' }),
    runWorldReleaseChecks: async () => passingChecks,
    writeAudit: async () => {},
  });
}

test('submission freezes the stored snapshot and consent revocation blocks a later publish', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser({ birthMonth: '2018-01' });
  const admin = await createUser({ role: 'admin', label: 'Moderator' });
  const fixture = await createWorldFixture({ owner, withGrantedConsent: true });
  const releaseService = service();

  const candidate = await releaseService.submitWorldRelease({
    actor: owner, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: 'snapshot-consent-key',
  });
  assert.equal(candidate.status, 'review_pending');

  await pool.query("UPDATE projects SET title = 'Later Private Edit', revision = 5 WHERE id = ?", [fixture.projectId]);
  const [[stored]] = await pool.query(
    'SELECT project_play_snapshot_id, project_revision FROM world_releases WHERE id = ?',
    [candidate.id],
  );
  assert.deepEqual(
    { snapshotId: stored.project_play_snapshot_id, revision: Number(stored.project_revision) },
    { snapshotId: fixture.snapshot.id, revision: 4 },
  );

  await pool.query("UPDATE parental_consents SET status = 'denied' WHERE child_profile_id = ?", [owner.profileId]);
  await assert.rejects(
    () => releaseService.decideWorldRelease({ actor: admin, releaseId: candidate.id, action: 'publish' }),
    (error) => error?.code === 'release_auth_forbidden',
  );
  const [[unchanged]] = await pool.query('SELECT status, current_public FROM world_releases WHERE id = ?', [candidate.id]);
  assert.deepEqual({ status: unchanged.status, currentPublic: Number(unchanged.current_public) }, { status: 'review_pending', currentPublic: 0 });
});

test('concurrent publication leaves one current release and removal never mutates the private graph', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await createUser();
  const adminA = await createUser({ role: 'admin', label: 'Moderator A' });
  const adminB = await createUser({ role: 'admin', label: 'Moderator B' });
  const fixture = await createWorldFixture({ owner });
  const releaseService = service();

  const first = await releaseService.submitWorldRelease({
    actor: owner, projectId: fixture.projectId, expectedRevision: 4, idempotencyKey: 'concurrent-release-key-a',
  });
  await pool.query("UPDATE projects SET revision = 5, title = 'Private Revision Five' WHERE id = ?", [fixture.projectId]);
  await insertSnapshot({ projectId: fixture.projectId, ownerId: owner.profileId, revision: 5, assetId: fixture.assetId });
  const second = await releaseService.submitWorldRelease({
    actor: owner, projectId: fixture.projectId, expectedRevision: 5, idempotencyKey: 'concurrent-release-key-b',
  });

  await Promise.all([
    releaseService.decideWorldRelease({ actor: adminA, releaseId: first.id, action: 'publish' }),
    releaseService.decideWorldRelease({ actor: adminB, releaseId: second.id, action: 'publish' }),
  ]);
  const [published] = await pool.query(
    "SELECT id, status, current_public FROM world_releases WHERE project_id = ? AND status = 'published'",
    [fixture.projectId],
  );
  assert.equal(published.filter((row) => Number(row.current_public) === 1).length, 1);

  const current = published.find((row) => Number(row.current_public) === 1);
  const [[beforeRemoval]] = await pool.query('SELECT title, revision FROM projects WHERE id = ?', [fixture.projectId]);
  const [[beforeGraph]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM assets WHERE project_id = ?) AS asset_count,
            (SELECT COUNT(*) FROM project_play_snapshots WHERE project_id = ?) AS snapshot_count`,
    [fixture.projectId, fixture.projectId],
  );
  await releaseService.takeDownWorldRelease({ actor: adminA, releaseId: current.id, reasonCode: 'administrative_action' });
  const [[removed]] = await pool.query('SELECT status, current_public FROM world_releases WHERE id = ?', [current.id]);
  const [[afterRemoval]] = await pool.query('SELECT title, revision FROM projects WHERE id = ?', [fixture.projectId]);
  const [[afterGraph]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM assets WHERE project_id = ?) AS asset_count,
            (SELECT COUNT(*) FROM project_play_snapshots WHERE project_id = ?) AS snapshot_count`,
    [fixture.projectId, fixture.projectId],
  );

  assert.deepEqual({ status: removed.status, currentPublic: Number(removed.current_public) }, { status: 'taken_down', currentPublic: 0 });
  assert.deepEqual(afterRemoval, beforeRemoval, 'takedown changes release authority only');
  assert.deepEqual(afterGraph, beforeGraph, 'takedown retains the private editing graph and immutable snapshots');

  await pool.query("UPDATE projects SET revision = 6, title = 'Private Revision Six' WHERE id = ?", [fixture.projectId]);
  await insertSnapshot({ projectId: fixture.projectId, ownerId: owner.profileId, revision: 6, assetId: fixture.assetId });
  const withdrawable = await releaseService.submitWorldRelease({
    actor: owner, projectId: fixture.projectId, expectedRevision: 6, idempotencyKey: 'withdrawal-private-graph-key',
  });
  await releaseService.decideWorldRelease({ actor: adminA, releaseId: withdrawable.id, action: 'publish' });
  const [[beforeWithdrawal]] = await pool.query('SELECT title, revision FROM projects WHERE id = ?', [fixture.projectId]);
  await releaseService.withdrawWorldRelease({ actor: owner, projectId: fixture.projectId, releaseId: withdrawable.id });
  const [[withdrawn]] = await pool.query('SELECT status, current_public FROM world_releases WHERE id = ?', [withdrawable.id]);
  const [[afterWithdrawal]] = await pool.query('SELECT title, revision FROM projects WHERE id = ?', [fixture.projectId]);
  assert.deepEqual({ status: withdrawn.status, currentPublic: Number(withdrawn.current_public) }, { status: 'withdrawn', currentPublic: 0 });
  assert.deepEqual(afterWithdrawal, beforeWithdrawal, 'withdrawal also leaves the private editing graph untouched');
});
