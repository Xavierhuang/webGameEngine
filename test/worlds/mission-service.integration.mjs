import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import mysql from 'mysql2/promise';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveCompiledAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename(resolve('test/.build', `${request.slice(2)}.js`), parent, isMain, options);
  }
  return originalResolveFilename(request, parent, isMain, options);
};

const DB_NAME = process.env.MYSQL_DATABASE || 'gameengine_test';
if (!DB_NAME.includes('_test')) throw new Error(`Refusing to run mission tests against ${DB_NAME}`);

let pool = null;
let unavailable = null;
const projects = [];
const profiles = [];

test.before(async () => {
  try {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: DB_NAME,
      multipleStatements: true,
      connectionLimit: 4,
    });
    const migration = await readFile(resolve('migrations/011_world_builder.sql'), 'utf8');
    await pool.query(migration.replace(/^USE gameengine;\s*$/m, ''));
    const sessionMigration = await readFile(resolve('migrations/012_world_mission_sessions.sql'), 'utf8');
    await pool.query(sessionMigration.replace(/^USE gameengine;\s*$/m, ''));
  } catch (error) {
    unavailable = error instanceof Error ? error.message : String(error);
    await pool?.end().catch(() => {});
    pool = null;
  }
});

test.after(async () => {
  if (!pool) return;
  for (const id of projects) await pool.query('DELETE FROM projects WHERE id = ?', [id]).catch(() => {});
  for (const id of profiles) await pool.query('DELETE FROM profiles WHERE id = ?', [id]).catch(() => {});
  await pool.end();
});

function requireMysql(t) {
  if (pool) return true;
  t.skip(`MySQL unavailable: ${unavailable}`);
  return false;
}

async function makeActor(label) {
  const profileId = randomUUID();
  profiles.push(profileId);
  await pool.query(
    "INSERT INTO profiles (id, user_id, profile_kind, display_name, role) VALUES (?, NULL, 'guest', ?, 'child')",
    [profileId, label],
  );
  return { kind: 'guest', profileId, sessionId: randomUUID() };
}

async function makeWorld(ownerId, templateId = 'platformer', baseline = {}) {
  const projectId = randomUUID();
  const sceneId = randomUUID();
  const objectId = randomUUID();
  projects.push(projectId);
  await pool.query(
    "INSERT IGNORE INTO world_templates (template_id, version, catalog_metadata, active) VALUES (?, 1, '{}', TRUE)",
    [templateId],
  );
  await pool.query(
    "INSERT INTO projects (id, owner_id, title, visibility, is_published, moderation_status, revision) VALUES (?, ?, 'Mission world', 'private', FALSE, 'draft', 4)",
    [projectId, ownerId],
  );
  await pool.query("INSERT INTO scenes (id, project_id, name, order_index, background_color) VALUES (?, ?, 'Scene', 0, '#ffffff')", [sceneId, projectId]);
  await pool.query("INSERT INTO game_objects (id, scene_id, type, name, properties, order_index) VALUES (?, ?, 'character', 'Hero', '{}', 0)", [objectId, sceneId]);
  await pool.query(
    "INSERT INTO logic_blocks (id, game_object_id, project_id, scene_id, block_type, category, parent_block_id, order_index, block_data) VALUES (?, ?, ?, ?, 'forever', 'control', NULL, 0, ?)",
    [randomUUID(), objectId, projectId, sceneId, JSON.stringify({ children: [{ block_type: 'jump' }] })],
  );
  const snapshotId = randomUUID();
  await pool.query(
    "INSERT INTO project_play_snapshots (id, project_id, revision, snapshot_json, snapshot_sha256) VALUES (?, ?, 4, '{}', ?)",
    [snapshotId, projectId, 'a'.repeat(64)],
  );
  await pool.query(
    "INSERT INTO project_worlds (project_id, template_id, template_version, world_metadata) VALUES (?, ?, 1, ?)",
    [projectId, templateId, JSON.stringify({ baselineRevision: 0, initialObjectIds: [], baselineBlockTypeCounts: {}, ...baseline })],
  );
  return { projectId, objectId, snapshotId };
}

async function makeService() {
  const { createMissionService } = await import('../.build/lib/worlds/missionService.js');
  const { createAccessService } = await import('../.build/lib/auth/access.js');
  const access = createAccessService({
    queryOne: async (sql, params = []) => {
      const [rows] = await pool.query(sql, params);
      return rows[0] ?? null;
    },
  });
  return createMissionService({ pool, requireProjectEdit: access.requireProjectEdit });
}

test('only the owner can read and idempotently advance server-verified mission progress', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await makeActor('owner');
  const stranger = await makeActor('stranger');
  const { projectId, objectId } = await makeWorld(owner.profileId);
  const service = await makeService();

  const initial = await service.getMissionProgress({ actor: owner, projectId });
  assert.ok(initial.length > 0, 'owner receives template mission DTOs');
  const first = await service.recordWorldMissionAction({ actor: owner, projectId, action: { type: 'block_present', objectId } });
  const completed = first.find((entry) => entry.status === 'completed');
  assert.ok(completed, 'server-recursive stored block completes its matching mission');
  const retry = await service.recordWorldMissionAction({ actor: owner, projectId, action: { type: 'block_present', objectId } });
  assert.deepEqual(retry, first, 're-sending a completed action is idempotent');
  await assert.rejects(() => service.getMissionProgress({ actor: stranger, projectId }), /project_(?:not_viewable|edit_forbidden)/);
});

test('mismatched project/world identity makes no mission-progress row changes', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await makeActor('owner mismatch');
  const { projectId, objectId } = await makeWorld(owner.profileId, 'not-in-catalog');
  const service = await makeService();
  await assert.rejects(
    () => service.recordWorldMissionAction({ actor: owner, projectId, action: { type: 'block_present', objectId } }),
    /world_identity_mismatch/,
  );
  const [[row]] = await pool.query('SELECT COUNT(*) AS count FROM world_mission_progress WHERE project_id = ?', [projectId]);
  assert.equal(Number(row.count), 0);
});

test('a template object present at creation cannot complete an object mission, but a later matching-type object can', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await makeActor('object baseline');
  const { projectId, objectId } = await makeWorld(owner.profileId);
  await pool.query(
    'UPDATE project_worlds SET world_metadata = ? WHERE project_id = ?',
    [JSON.stringify({ baselineRevision: 0, initialObjectIds: [objectId], baselineBlockTypeCounts: {} }), projectId],
  );
  const service = await makeService();

  const preexisting = await service.recordWorldMissionAction({ actor: owner, projectId, action: { type: 'object_present', objectId } });
  assert.equal(preexisting.find((entry) => entry.id === 'platformer-name-hero')?.status, 'not_started');

  const addedObjectId = randomUUID();
  const [[scene]] = await pool.query('SELECT id FROM scenes WHERE project_id = ?', [projectId]);
  await pool.query("INSERT INTO game_objects (id, scene_id, type, name, properties, order_index) VALUES (?, ?, 'character', 'A different name', '{}', 1)", [addedObjectId, scene.id]);
  await pool.query('UPDATE projects SET revision = 5 WHERE id = ?', [projectId]);
  const added = await service.recordWorldMissionAction({ actor: owner, projectId, action: { type: 'object_present', objectId: addedObjectId } });
  assert.equal(added.find((entry) => entry.id === 'platformer-name-hero')?.status, 'completed');
});

test('a baseline block cannot complete a mission until a target block is added after world creation', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await makeActor('block baseline');
  const { projectId, objectId } = await makeWorld(owner.profileId, 'platformer', { baselineBlockTypeCounts: { jump: 1 } });
  const service = await makeService();

  const baseline = await service.recordWorldMissionAction({ actor: owner, projectId, action: { type: 'block_present', objectId } });
  assert.equal(baseline.find((entry) => entry.id === 'platformer-add-jump')?.status, 'not_started');

  const [[scene]] = await pool.query('SELECT id FROM scenes WHERE project_id = ?', [projectId]);
  await pool.query(
    "INSERT INTO logic_blocks (id, game_object_id, project_id, scene_id, block_type, category, parent_block_id, order_index, block_data) VALUES (?, ?, ?, ?, 'jump', 'action', NULL, 1, '{}')",
    [randomUUID(), objectId, projectId, scene.id],
  );
  await pool.query('UPDATE projects SET revision = 5 WHERE id = ?', [projectId]);
  const added = await service.recordWorldMissionAction({ actor: owner, projectId, action: { type: 'block_present', objectId } });
  assert.equal(added.find((entry) => entry.id === 'platformer-add-jump')?.status, 'completed');
});

test('a direct play progress action cannot create its own session', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await makeActor('player session');
  const { projectId, snapshotId } = await makeWorld(owner.profileId);
  const service = await makeService();
  const direct = await service.recordWorldMissionAction({ actor: owner, projectId, action: { type: 'play_started', snapshotId } });
  assert.equal(direct.find((entry) => entry.id === 'platformer-play')?.status, 'not_started');
  const [[before]] = await pool.query('SELECT COUNT(*) AS count FROM world_mission_sessions WHERE snapshot_id = ?', [snapshotId]);
  assert.equal(Number(before.count), 0, 'progress POST must not create a player session');
});

test('a started player session binds the current snapshot to its actor before play progress advances', async (t) => {
  if (!requireMysql(t)) return;
  const owner = await makeActor('player session');
  const { projectId, snapshotId } = await makeWorld(owner.profileId);
  const service = await makeService();
  await service.startWorldMissionSession({ actor: owner, projectId, snapshotId });
  const missions = await service.recordWorldMissionAction({ actor: owner, projectId, action: { type: 'play_started', snapshotId } });
  assert.equal(missions.find((entry) => entry.id === 'platformer-play')?.status, 'completed');
  const [[session]] = await pool.query(
    'SELECT project_id, actor_profile_id, revision FROM world_mission_sessions WHERE snapshot_id = ?',
    [snapshotId],
  );
  assert.deepEqual(
    { projectId: session.project_id, actorProfileId: session.actor_profile_id, revision: Number(session.revision) },
    { projectId, actorProfileId: owner.profileId, revision: 4 },
  );
});

test('a rendered play snapshot stays stable after the mutable graph changes', async (t) => {
  if (!requireMysql(t)) return;
  const { writePlaySnapshot } = await import('../.build/lib/projects/commandService.js');
  const owner = await makeActor('snapshot stability');
  const { projectId, objectId } = await makeWorld(owner.profileId);
  await pool.query('DELETE FROM project_play_snapshots WHERE project_id = ?', [projectId]);
  const snapshot = await writePlaySnapshot({ projectId, expectedRevision: 4, pool });
  await pool.query("UPDATE game_objects SET name = 'Changed after play started' WHERE id = ?", [objectId]);
  await pool.query('UPDATE projects SET revision = 5 WHERE id = ?', [projectId]);
  const [[stored]] = await pool.query('SELECT snapshot_json FROM project_play_snapshots WHERE id = ?', [snapshot.snapshotId]);
  const parsed = typeof stored.snapshot_json === 'string' ? JSON.parse(stored.snapshot_json) : stored.snapshot_json;
  assert.equal(parsed.scenes[0].objects[0].name, 'Hero');
  assert.equal(parsed.project.revision, 4);
});

test('mission route module is registered for both reads and advances', async () => {
  const route = await import('../.build/app/api/projects/[id]/world-missions/route.js');
  assert.equal(typeof route.GET, 'function');
  assert.equal(typeof route.POST, 'function');
});
