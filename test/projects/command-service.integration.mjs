/**
 * Command service — real MySQL integration.
 *
 * The command service is a transactional orchestrator; the interesting
 * behaviors — idempotent replay, revision conflict, and the write-boundary
 * that only it may cross — are all cross-connection properties. Mocking
 * MySQL for these would prove that the mock is idempotent, not that the
 * service is. This suite therefore exercises the service against a real
 * `gameengine_test`, and skips loudly if MySQL is not reachable.
 *
 * Run: `MYSQL_DATABASE=gameengine_test node test/projects/command-service.integration.mjs`
 *      (or via `npm run test:commands`, which sets it up.)
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import {
  executeProjectCommand,
  writePlaySnapshot,
  CommandServiceError,
} from '../.build/lib/projects/commandService.js';

const DB_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASSWORD = process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.MYSQL_DATABASE || 'gameengine_test';

if (!DB_NAME.includes('_test')) {
  throw new Error(
    `Refusing to run destructive command-service tests against ${DB_NAME}; ` +
      'database name must contain _test',
  );
}

let pool = null;
let mysqlUnavailableReason = null;
const projectsCreated = [];

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
    // Best-effort cleanup for anything this suite created. `RESTRICT` FKs on
    // project_commands + play_snapshots mean we have to purge them first.
    for (const projectId of projectsCreated) {
      await pool.query('DELETE FROM project_commands WHERE project_id = ?', [projectId]).catch(() => {});
      await pool.query('DELETE FROM project_play_snapshots WHERE project_id = ?', [projectId]).catch(() => {});
      await pool.query('DELETE FROM logic_blocks WHERE project_id = ?', [projectId]).catch(() => {});
      await pool.query(
        'DELETE FROM game_objects WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)',
        [projectId],
      ).catch(() => {});
      await pool.query('DELETE FROM scenes WHERE project_id = ?', [projectId]).catch(() => {});
      await pool.query('DELETE FROM assets WHERE project_id = ?', [projectId]).catch(() => {});
      await pool.query('DELETE FROM projects WHERE id = ?', [projectId]).catch(() => {});
      await pool.query(
        'DELETE FROM profiles WHERE id IN (SELECT id FROM (SELECT profiles.id FROM profiles LEFT JOIN projects ON projects.owner_id = profiles.id WHERE profiles.id = ? AND projects.id IS NULL) x)',
        [`test-profile-${projectId}`],
      ).catch(() => {});
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

async function makeProject() {
  // Create a minimal owner profile + project row so the service has something
  // to lock. No FK to auth.users is required — profiles.user_id is nullable
  // (migration 008 relaxed that for guests).
  const profileId = randomUUID();
  const projectId = randomUUID();
  projectsCreated.push(projectId);
  await pool.query(
    "INSERT INTO profiles (id, user_id, profile_kind, display_name, role) VALUES (?, NULL, 'guest', 'cmd test', 'child')",
    [profileId],
  );
  await pool.query(
    "INSERT INTO projects (id, owner_id, title, visibility, moderation_status, revision) VALUES (?, ?, 'test project', 'private', 'draft', 0)",
    [projectId, profileId],
  );
  return { projectId, profileId };
}

function actor(profileId) {
  return { kind: 'guest', profileId, actorKey: `guest:${profileId}` };
}

function envelope(command, { idempotencyKey, expectedRevision } = {}) {
  return {
    expectedRevision,
    idempotencyKey: idempotencyKey ?? `idem-${randomUUID().replace(/-/g, '')}`,
    editingSessionId: randomUUID(),
    groupId: `g-${randomUUID().slice(0, 8)}`,
    command,
  };
}

test('scene.create increments revision by exactly one', async (t) => {
  if (!requireMysql(t)) return;
  const { projectId, profileId } = await makeProject();

  const result = await executeProjectCommand({
    actor: actor(profileId),
    projectId,
    envelope: envelope(
      { type: 'scene.create', sceneId: randomUUID(), name: 'Scene 1' },
      { expectedRevision: 0 },
    ),
    pool,
  });

  assert.equal(result.revision, 1);
  assert.equal(result.replayed, false);
  const [rows] = await pool.query('SELECT revision FROM projects WHERE id = ?', [projectId]);
  assert.equal(Number(rows[0].revision), 1);
});

test('duplicate idempotency key replays the original result — no double write', async (t) => {
  if (!requireMysql(t)) return;
  const { projectId, profileId } = await makeProject();
  const sceneId = randomUUID();
  const env = envelope(
    { type: 'scene.create', sceneId, name: 'Idem' },
    { expectedRevision: 0, idempotencyKey: 'idem-1234567890abcdef' },
  );

  const first = await executeProjectCommand({ actor: actor(profileId), projectId, envelope: env, pool });
  const second = await executeProjectCommand({ actor: actor(profileId), projectId, envelope: env, pool });

  assert.equal(second.commandId, first.commandId, 'replay must return the same commandId');
  assert.equal(second.revision, first.revision, 'replay must not advance the revision');
  assert.equal(second.replayed, true);

  const [count] = await pool.query(
    'SELECT COUNT(*) AS c FROM scenes WHERE project_id = ? AND id = ?',
    [projectId, sceneId],
  );
  assert.equal(Number(count[0].c), 1, 'replay must not create a second scene row');
});

test('idempotency mismatch on same key with different payload returns 409', async (t) => {
  if (!requireMysql(t)) return;
  const { projectId, profileId } = await makeProject();
  const idempotencyKey = 'idem-abcdef0123456789';
  await executeProjectCommand({
    actor: actor(profileId),
    projectId,
    envelope: envelope(
      { type: 'scene.create', sceneId: randomUUID(), name: 'First' },
      { expectedRevision: 0, idempotencyKey },
    ),
    pool,
  });

  await assert.rejects(
    () =>
      executeProjectCommand({
        actor: actor(profileId),
        projectId,
        envelope: envelope(
          { type: 'scene.create', sceneId: randomUUID(), name: 'Different' },
          { expectedRevision: 1, idempotencyKey },
        ),
        pool,
      }),
    (error) => error instanceof CommandServiceError && error.code === 'idempotency_mismatch',
  );
});

test('concurrent commands at the same expectedRevision — exactly one wins', async (t) => {
  if (!requireMysql(t)) return;
  const { projectId, profileId } = await makeProject();

  const settle = await Promise.allSettled([
    executeProjectCommand({
      actor: actor(profileId),
      projectId,
      envelope: envelope(
        { type: 'scene.create', sceneId: randomUUID(), name: 'A' },
        { expectedRevision: 0 },
      ),
      pool,
    }),
    executeProjectCommand({
      actor: actor(profileId),
      projectId,
      envelope: envelope(
        { type: 'scene.create', sceneId: randomUUID(), name: 'B' },
        { expectedRevision: 0 },
      ),
      pool,
    }),
  ]);

  const fulfilled = settle.filter((r) => r.status === 'fulfilled');
  const rejected = settle.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one command must apply');
  assert.equal(rejected.length, 1, 'the loser must be rejected, not silently overwrite');
  const loser = rejected[0].reason;
  assert.ok(loser instanceof CommandServiceError, `loser must be a CommandServiceError, got ${loser}`);
  assert.equal(loser.code, 'revision_conflict');
  assert.equal(loser.httpStatus, 409);
  assert.equal(loser.attributes?.currentRevision, 1);

  const [rev] = await pool.query('SELECT revision FROM projects WHERE id = ?', [projectId]);
  assert.equal(Number(rev[0].revision), 1, 'winner must have advanced revision by exactly one');
});

test('unknown command type rejected before any DB write', async (t) => {
  if (!requireMysql(t)) return;
  const { projectId, profileId } = await makeProject();

  await assert.rejects(
    () =>
      executeProjectCommand({
        actor: actor(profileId),
        projectId,
        envelope: {
          idempotencyKey: 'idem-badbadbad00000000',
          editingSessionId: randomUUID(),
          groupId: 'g-1',
          command: { type: 'project.destroyAllHumans' },
        },
        pool,
      }),
    (error) => error instanceof CommandServiceError && error.code === 'validation_failed',
  );

  const [count] = await pool.query('SELECT COUNT(*) AS c FROM project_commands WHERE project_id = ?', [projectId]);
  assert.equal(Number(count[0].c), 0, 'a failed validation must not write a project_commands row');
});

test('command stores server-computed inverse; client-supplied inverse is rejected by schema', async (t) => {
  if (!requireMysql(t)) return;
  const { projectId, profileId } = await makeProject();
  const sceneId = randomUUID();

  await executeProjectCommand({
    actor: actor(profileId),
    projectId,
    envelope: envelope(
      { type: 'scene.create', sceneId, name: 'With inverse' },
      { expectedRevision: 0 },
    ),
    pool,
  });

  const [rows] = await pool.query(
    'SELECT inverse_json FROM project_commands WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
    [projectId],
  );
  const inverse = typeof rows[0].inverse_json === 'string' ? JSON.parse(rows[0].inverse_json) : rows[0].inverse_json;
  assert.equal(inverse.type, 'scene.delete', 'inverse of scene.create must be scene.delete');
  assert.equal(inverse.sceneId, sceneId);

  // Client-supplied inverse: envelope schema is .strict() and must reject
  // the extra key before the service ever runs.
  await assert.rejects(
    () =>
      executeProjectCommand({
        actor: actor(profileId),
        projectId,
        envelope: {
          idempotencyKey: 'idem-strictstrictstrict',
          editingSessionId: randomUUID(),
          groupId: 'g-2',
          command: { type: 'scene.delete', sceneId },
          expectedRevision: 1,
          // Attempted smuggle: strict schema rejects any extra top-level key.
          inverse: { type: 'scene.create', sceneId, name: 'malicious undo' },
        },
        pool,
      }),
    (error) => error instanceof CommandServiceError && error.code === 'validation_failed',
  );
});

test('play-snapshot pins the exact revision and refuses a stale expectedRevision', async (t) => {
  if (!requireMysql(t)) return;
  const { projectId, profileId } = await makeProject();
  const sceneId = randomUUID();

  await executeProjectCommand({
    actor: actor(profileId),
    projectId,
    envelope: envelope({ type: 'scene.create', sceneId, name: 'S' }, { expectedRevision: 0 }),
    pool,
  });

  const snapshot = await writePlaySnapshot({ projectId, expectedRevision: 1, pool });
  assert.equal(snapshot.revision, 1);
  assert.match(snapshot.contentHash, /^[0-9a-f]{64}$/);

  // Re-request at the same revision must return the same snapshotId,
  // not create a duplicate row. UNIQUE (project_id, revision) enforces this.
  const again = await writePlaySnapshot({ projectId, expectedRevision: 1, pool });
  assert.equal(again.snapshotId, snapshot.snapshotId, 'a second request at the same revision must reuse the row');
  assert.equal(again.reused, true);
  assert.equal(again.contentHash, snapshot.contentHash);

  // Stale request: client thinks the revision is 0, but it's 1.
  await assert.rejects(
    () => writePlaySnapshot({ projectId, expectedRevision: 0, pool }),
    (error) => error instanceof CommandServiceError && error.code === 'revision_conflict',
  );
});

test('handler failure rolls back the transaction — no orphan project_commands row', async (t) => {
  if (!requireMysql(t)) return;
  const { projectId, profileId } = await makeProject();

  // Delete a scene that doesn't exist — the handler throws before any real
  // write happens. But even if the handler had written before failing, the
  // whole withTransaction block must rollback.
  await assert.rejects(
    () =>
      executeProjectCommand({
        actor: actor(profileId),
        projectId,
        envelope: envelope({ type: 'scene.delete', sceneId: randomUUID() }, { expectedRevision: 0 }),
        pool,
      }),
    (error) => error instanceof CommandServiceError && error.code === 'handler_failed',
  );

  const [count] = await pool.query(
    'SELECT COUNT(*) AS c FROM project_commands WHERE project_id = ?',
    [projectId],
  );
  assert.equal(Number(count[0].c), 0, 'failed handler must not leave a project_commands row');

  const [rev] = await pool.query('SELECT revision FROM projects WHERE id = ?', [projectId]);
  assert.equal(Number(rev[0].revision), 0, 'failed handler must not advance revision');
});
