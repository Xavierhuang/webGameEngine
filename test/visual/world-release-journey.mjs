/**
 * The full world-release journey, end to end, against a real database.
 *
 * Every other release test verifies one layer. This drives the whole sequence
 * a creator, a moderator, and a visitor actually take, in order, through the
 * real service, the real route handlers, the real public page loader, and the
 * real report path — and fails at the first step that cannot be taken.
 *
 *   node test/visual/world-release-journey.mjs
 *
 * Unlike the other files in `test/visual/`, this needs no browser and no
 * running server. Those drive rendered pages through Playwright against
 * localhost:3100; neither `test:all` nor `test:critical` runs them, because a
 * gate that needs a live server is a gate CI cannot run. Every boundary this
 * journey exists to protect — release authority, the snapshot freeze, the
 * public/private line, remix provenance, report linkage — lives in the service,
 * route, and loader layers, and all of those are exercised here for real.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BUILD_ROOT = path.join(ROOT, 'test/.build');
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const Module = require('node:module');

const DB_NAME = process.env.MYSQL_DATABASE || 'gameengine_test';
if (!DB_NAME.includes('_test')) {
  throw new Error(`Refusing to run the release journey against ${DB_NAME}; database name must contain _test`);
}
process.env.MYSQL_DATABASE = DB_NAME;
process.env.FEATURE_FLAG_COMMUNITY_PUBLISHING = 'true';
process.env.AUDIT_HMAC_SECRET = process.env.AUDIT_HMAC_SECRET || 'release-journey-secret';

const { buildPassingWorldSnapshot } = await import('../helpers/world-release-fixture.mjs');

let currentActor = { kind: 'anonymous' };
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/auth/actor') {
    return { resolveActor: async () => currentActor, resolveCurrentActor: async () => currentActor };
  }
  if (request.startsWith('@/')) return originalLoad(path.join(BUILD_ROOT, `${request.slice(2)}.js`), parent, isMain);
  return originalLoad(request, parent, isMain);
};
const releasesRoute = require(path.join(BUILD_ROOT, 'app/api/projects/[id]/world-releases/route.js'));
const withdrawRoute = require(path.join(BUILD_ROOT, 'app/api/projects/[id]/world-releases/[releaseId]/withdraw/route.js'));
const decisionRoute = require(path.join(BUILD_ROOT, 'app/api/admin/world-releases/[releaseId]/decision/route.js'));
const remixRoute = require(path.join(BUILD_ROOT, 'app/api/world-releases/[releaseId]/remix/route.js'));
const releaseAccess = require(path.join(BUILD_ROOT, 'lib/worlds/releaseAccess.js'));
const { submitReport } = require(path.join(BUILD_ROOT, 'lib/safety/reportSubmission.server.js'));
const { hashProjectSnapshot } = require(path.join(BUILD_ROOT, 'lib/projects/projectSnapshot.js'));
Module._load = originalLoad;

const steps = [];
let failure = null;

async function step(name, fn) {
  if (failure) return undefined;
  try {
    const value = await fn();
    steps.push(name);
    console.log(`  ok  ${name}`);
    return value;
  } catch (error) {
    failure = { name, error };
    console.log(`FAIL  ${name}`);
    return undefined;
  }
}

function httpRequest(body, headers = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([n, v]) => [n.toLowerCase(), v]));
  return {
    headers: { get: (name) => normalized[name.toLowerCase()] ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  };
}

async function call(handler, req, routeParams, actor) {
  currentActor = actor;
  const response = await handler(req, { params: Promise.resolve(routeParams) });
  return { status: response.status, body: await response.json() };
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: DB_NAME, connectionLimit: 6, multipleStatements: true,
});

const projectIds = [];
const profileIds = [];
const userIds = [];

async function cleanup() {
  for (const projectId of [...projectIds].reverse()) {
    await pool.query('UPDATE projects SET source_release_id = NULL, remixed_from = NULL WHERE id = ?', [projectId]).catch(() => {});
  }
  await pool.query("DELETE FROM reports WHERE reported_project_id IN (?)", [projectIds.length ? projectIds : ['']]).catch(() => {});
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
  for (const profileId of profileIds) {
    await pool.query('DELETE FROM parental_consents WHERE child_profile_id = ?', [profileId]).catch(() => {});
    await pool.query('DELETE FROM profiles WHERE id = ?', [profileId]).catch(() => {});
  }
  for (const userId of userIds) await pool.query('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
  await pool.end().catch(() => {});
  const globalPool = globalThis.__mysqlPool;
  if (globalPool) { await globalPool.end().catch(() => {}); delete globalThis.__mysqlPool; }
}

async function createUser({ role = 'child', label = 'World Builder', birthMonth = '1980-01' } = {}) {
  const userId = randomUUID();
  const profileId = randomUUID();
  userIds.push(userId);
  profileIds.push(profileId);
  await pool.query(`INSERT INTO users (id, email, password_hash, email_verified) VALUES (?, ?, 'h', TRUE)`, [userId, `${userId}@example.test`]);
  await pool.query(
    `INSERT INTO profiles (id, user_id, profile_kind, role, display_name, birth_month) VALUES (?, ?, 'user', ?, ?, ?)`,
    [profileId, userId, role, label, birthMonth],
  );
  return { kind: 'user', userId, profileId };
}

console.log('World release journey\n');

try {
  await step('the release schema is present', async () => {
    for (const name of fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      let migration = fs.readFileSync(path.join(ROOT, 'migrations', name), 'utf8').replace(/^USE gameengine;\s*$/m, '');
      if (name === '001_initial_schema.sql') {
        migration = migration.replace(/-- Trigger to auto-create profile when user is created[\s\S]*?DELIMITER ;\s*/m, '');
      }
      await pool.query(migration);
    }
    await pool.query('DROP TRIGGER IF EXISTS after_user_insert');
    await pool.query('SELECT 1 FROM world_releases LIMIT 1');
  });

  // A consented under-13 creator — the case the whole consent boundary exists for.
  const child = await step('a consented under-13 creator exists', async () => {
    const actor = await createUser({ birthMonth: '2018-01', label: 'Cloud Builder' });
    await pool.query(
      `INSERT INTO parental_consents (id, child_profile_id, parent_email, token_hash, status, expires_at)
       VALUES (?, ?, 'parent@example.test', ?, 'granted', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY))`,
      [randomUUID(), actor.profileId, randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')],
    );
    return actor;
  });
  const admin = await step('a moderator exists', () => createUser({ role: 'admin', label: 'Moderator' }));
  const visitor = await step('a signed-in visitor exists', () => createUser({ label: 'Visitor' }));

  const world = await step('the creator has a World Builder world at revision 4', async () => {
    const projectId = randomUUID();
    const assetId = randomUUID();
    projectIds.push(projectId);
    await pool.query(
      `INSERT INTO projects (id, owner_id, title, description, visibility, is_published, moderation_status, revision)
       VALUES (?, ?, 'Mutable Draft', 'Private editing graph', 'private', FALSE, 'draft', 4)`,
      [projectId, child.profileId],
    );
    await pool.query(`INSERT INTO world_templates (template_id, version, catalog_metadata, active) VALUES ('platformer', 2, JSON_OBJECT(), TRUE) ON DUPLICATE KEY UPDATE active = TRUE`);
    await pool.query(`INSERT INTO project_worlds (project_id, template_id, template_version, world_metadata) VALUES (?, 'platformer', 2, JSON_OBJECT())`, [projectId]);
    await pool.query(
      `INSERT INTO assets (id, project_id, owner_id, asset_type, name, file_url, file_size, mime_type)
       VALUES (?, ?, ?, 'image', 'Cloud', '/uploads/textures/frozen.png', 512, 'image/png')`,
      [assetId, projectId, child.profileId],
    );
    const snapshots = {};
    for (const revision of [0, 4]) {
      const snapshot = buildPassingWorldSnapshot({ projectId, ownerId: child.profileId, revision, title: 'Frozen Cloud Castle' });
      snapshot.assets = [{ id: assetId, asset_type: 'image', name: 'Cloud', file_url: '/uploads/textures/frozen.png', mime_type: 'image/png', blob_checksum: null }];
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
    await pool.query('INSERT INTO world_release_beta_cohort_members (world_release_id, profile_id) VALUES (?, ?)', [cohortReleaseId, child.profileId]);
    return { projectId, assetId, snapshot: snapshots[4] };
  });

  const releaseId = await step('the creator submits the current revision for review', async () => {
    const created = await call(
      releasesRoute.POST,
      httpRequest({ expectedRevision: 4 }, { 'Idempotency-Key': `journey-${randomUUID()}` }),
      { id: world.projectId }, child,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.release.status, 'review_pending', 'the candidate reaches review');
    return created.body.release.id;
  });

  await step('the world is not public while it waits for review', async () => {
    const listed = await releaseAccess.listPublicWorldReleases({ page: 1, pageSize: 60 });
    assert.equal(listed.some((r) => r.id === releaseId), false);
  });

  await step('a non-admin cannot publish it', async () => {
    const attempt = await call(decisionRoute.POST, httpRequest({ action: 'publish' }), { releaseId }, visitor);
    assert.equal(attempt.status, 403);
  });

  const slug = await step('the moderator approves it', async () => {
    const decided = await call(decisionRoute.POST, httpRequest({ action: 'publish' }), { releaseId }, admin);
    assert.equal(decided.status, 200, JSON.stringify(decided.body));
    const [[row]] = await pool.query('SELECT public_slug FROM world_releases WHERE id = ?', [releaseId]);
    assert.match(row.public_slug, /^wr_[0-9a-f]{32}$/);
    return row.public_slug;
  });

  await step('the public world is playable', async () => {
    const published = await releaseAccess.getPublicWorldReleaseSnapshot(slug);
    assert.ok(published, 'the slug resolves');
    assert.equal(published.release.title, 'Frozen Cloud Castle');
    assert.ok(published.snapshot.scenes.length > 0, 'it has playable scenes');
    assert.equal(published.worldIdentity.templateId, 'platformer');
  });

  await step('it appears in public discovery', async () => {
    const listed = await releaseAccess.listPublicWorldReleases({ page: 1, pageSize: 60 });
    assert.ok(listed.some((r) => r.slug === slug), 'the approved release is discoverable');
  });

  await step('the creator keeps editing the private draft', async () => {
    await pool.query("UPDATE projects SET title = 'Totally Different Now', description = 'edited', revision = 9 WHERE id = ?", [world.projectId]);
    await pool.query("UPDATE assets SET name = 'Renamed', file_url = '/uploads/textures/changed.png' WHERE project_id = ?", [world.projectId]);
  });

  await step('the public world still serves the original approved snapshot', async () => {
    const published = await releaseAccess.getPublicWorldReleaseSnapshot(slug);
    assert.equal(published.release.title, 'Frozen Cloud Castle', 'the public title did not follow the private edit');
    assert.equal(published.snapshot.project.revision, 4);
    assert.equal(hashProjectSnapshot(published.snapshot), world.snapshot.hash, 'the public snapshot still hashes to the approved hash');
  });

  await step('a visitor remixes it and receives what they played, privately', async () => {
    const remix = await call(remixRoute.POST, httpRequest({}), { releaseId }, visitor);
    assert.equal(remix.status, 201, JSON.stringify(remix.body));
    projectIds.push(remix.body.project.id);
    const [[project]] = await pool.query(
      'SELECT owner_id, title, visibility, source_release_id, remixed_from FROM projects WHERE id = ?',
      [remix.body.project.id],
    );
    assert.equal(project.owner_id, visitor.profileId);
    assert.equal(project.visibility, 'private');
    assert.equal(project.source_release_id, releaseId);
    assert.equal(project.remixed_from, world.projectId);
    assert.match(project.title, /^Frozen Cloud Castle/, 'the remix carries the frozen title, not the edited one');
  });

  await step('a visitor can report the exact release they saw', async () => {
    currentActor = visitor;
    const filed = await submitReport(visitor, { projectId: world.projectId, releaseId, reason: 'inappropriate' });
    const [[stored]] = await pool.query('SELECT world_release_id, reported_project_id FROM reports WHERE id = ?', [filed.id]);
    assert.equal(stored.world_release_id, releaseId);
    assert.equal(stored.reported_project_id, world.projectId);
  });

  await step('a visitor play advances the counter and the creator’s own view does not', async () => {
    // Mirrors `app/worlds/[slug]/page.tsx`: the page counts a play unless the
    // viewer is the creator. Binding constraint recorded in the Task 6 review.
    const published = await releaseAccess.getPublicWorldReleaseSnapshot(slug);
    const countPlay = async (viewer) => {
      const isCreator = viewer.kind !== 'anonymous' && viewer.profileId === published.snapshot.project.owner_id;
      if (!isCreator) {
        await pool.query('UPDATE projects SET play_count = play_count + 1 WHERE id = ?', [published.snapshot.project.id]);
      }
    };
    const before = (await pool.query('SELECT play_count FROM projects WHERE id = ?', [world.projectId]))[0][0].play_count;
    await countPlay(visitor);
    const afterVisitor = (await pool.query('SELECT play_count FROM projects WHERE id = ?', [world.projectId]))[0][0].play_count;
    assert.equal(Number(afterVisitor), Number(before) + 1, 'a visitor play counts');
    await countPlay(child);
    const afterCreator = (await pool.query('SELECT play_count FROM projects WHERE id = ?', [world.projectId]))[0][0].play_count;
    assert.equal(Number(afterCreator), Number(afterVisitor), 'the creator viewing their own world does not count');
  });

  await step('the creator withdraws it', async () => {
    const withdrawn = await call(withdrawRoute.POST, httpRequest({}), { id: world.projectId, releaseId }, child);
    assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
    assert.equal(withdrawn.body.release.status, 'withdrawn');
  });

  await step('the world is gone from every public path', async () => {
    assert.equal(await releaseAccess.getPublicWorldReleaseSnapshot(slug), null, 'the page lookup is absent');
    assert.equal(await releaseAccess.getPublicWorldReleaseBySlug(slug), null, 'the slug lookup is absent');
    const listed = await releaseAccess.listPublicWorldReleases({ page: 1, pageSize: 60 });
    assert.equal(listed.some((r) => r.slug === slug), false, 'discovery no longer lists it');
    const remixAttempt = await call(remixRoute.POST, httpRequest({}), { releaseId }, visitor);
    assert.equal(remixAttempt.status, 404, 'it can no longer be remixed');
  });

  await step('the private draft survives the whole journey untouched', async () => {
    const [[project]] = await pool.query('SELECT title, revision, visibility FROM projects WHERE id = ?', [world.projectId]);
    assert.equal(project.title, 'Totally Different Now', 'the creator keeps their edits');
    assert.equal(Number(project.revision), 9);
    assert.equal(project.visibility, 'private');
    const [[snapshots]] = await pool.query('SELECT COUNT(*) AS total FROM project_play_snapshots WHERE project_id = ?', [world.projectId]);
    assert.ok(Number(snapshots.total) >= 2, 'the immutable snapshots are retained');
  });

  await step('the creator can submit the same revision again after withdrawing', async () => {
    await pool.query('UPDATE projects SET revision = 4 WHERE id = ?', [world.projectId]);
    const resubmitted = await call(
      releasesRoute.POST,
      httpRequest({ expectedRevision: 4 }, { 'Idempotency-Key': `journey-again-${randomUUID()}` }),
      { id: world.projectId }, child,
    );
    assert.equal(resubmitted.status, 201, JSON.stringify(resubmitted.body));
    assert.notEqual(resubmitted.body.release.id, releaseId);
  });
} finally {
  await cleanup();
}

console.log('');
if (failure) {
  console.error(`World release journey FAILED at: ${failure.name}`);
  console.error(failure.error?.stack ?? failure.error);
  process.exit(1);
}
console.log(`World release journey passed — ${steps.length} steps`);
