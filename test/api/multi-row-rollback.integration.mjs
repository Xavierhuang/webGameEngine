/**
 * Multi-row write rollback — Task 4 atomicity contract.
 *
 * Every allowlisted "creation/multi-row atomic" writer is expected to run
 * its writes inside a `withTransaction` block so a mid-write failure
 * leaves no partial rows. This suite exercises that expectation directly
 * against a real MySQL by wiring `withTransaction` with a wrapper that
 * simulates a failure between the first and last write, then asserts
 * neither the first-write row nor any downstream row landed.
 *
 * Also verifies the compat-writer precondition contract: the migrated
 * project-graph routes must return 428 when `Idempotency-Key` or
 * `If-Match: "<revision>"` is missing. We test the header parser + the
 * dispatch helper against a fake request rather than starting Next; the
 * helper is what every migrated route funnels through.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { withTransaction } from '../.build/lib/mysql/transaction.js';
import {
  parseIfMatchRevision,
  buildCompatEnvelope,
  PreconditionRequired,
} from '../.build/lib/projects/commandRouteHelper.js';

const DB_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASSWORD = process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.MYSQL_DATABASE || 'gameengine_test';

if (!DB_NAME.includes('_test')) {
  throw new Error(
    `Refusing to run destructive multi-row-rollback tests against ${DB_NAME}; ` +
      'database name must contain _test',
  );
}

let pool = null;
let mysqlUnavailableReason = null;
const created = [];

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
    for (const projectId of created) {
      await pool.query('DELETE FROM project_commands WHERE project_id = ?', [projectId]).catch(() => {});
      await pool.query('DELETE FROM logic_blocks WHERE project_id = ?', [projectId]).catch(() => {});
      await pool.query(
        'DELETE FROM game_objects WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)',
        [projectId],
      ).catch(() => {});
      await pool.query('DELETE FROM scenes WHERE project_id = ?', [projectId]).catch(() => {});
      await pool.query('DELETE FROM projects WHERE id = ?', [projectId]).catch(() => {});
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

async function makeProfile() {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO profiles (id, user_id, profile_kind, display_name, role) VALUES (?, NULL, 'guest', 'rollback test', 'child')",
    [id],
  );
  return id;
}

// --- withTransaction rollback contract ------------------------------------

test('withTransaction rolls back every write when the operation throws mid-flight', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeProfile();
  const projectId = randomUUID();
  const sceneId = randomUUID();
  created.push(projectId);

  // Simulate the shape of app/api/projects/route.ts POST: insert project,
  // insert scene, then throw before commit. Both must roll back together.
  await assert.rejects(
    () =>
      withTransaction(async (connection) => {
        await connection.execute(
          "INSERT INTO projects (id, owner_id, title, visibility, moderation_status, revision) VALUES (?, ?, 'partial', 'private', 'draft', 0)",
          [projectId, profileId],
        );
        await connection.execute(
          "INSERT INTO scenes (id, project_id, name, order_index) VALUES (?, ?, 'Main Scene', 0)",
          [sceneId, projectId],
        );
        throw new Error('simulated crash between scene and next row');
      }, { pool }),
    /simulated crash/,
  );

  const [projectRows] = await pool.query('SELECT COUNT(*) AS c FROM projects WHERE id = ?', [projectId]);
  assert.equal(Number(projectRows[0].c), 0, 'project row must not survive rollback');
  const [sceneRows] = await pool.query('SELECT COUNT(*) AS c FROM scenes WHERE id = ?', [sceneId]);
  assert.equal(Number(sceneRows[0].c), 0, 'scene row must not survive rollback');
});

test('withTransaction commits every write when the operation returns', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeProfile();
  const projectId = randomUUID();
  const sceneId = randomUUID();
  created.push(projectId);

  await withTransaction(async (connection) => {
    await connection.execute(
      "INSERT INTO projects (id, owner_id, title, visibility, moderation_status, revision) VALUES (?, ?, 'committed', 'private', 'draft', 0)",
      [projectId, profileId],
    );
    await connection.execute(
      "INSERT INTO scenes (id, project_id, name, order_index) VALUES (?, ?, 'Main Scene', 0)",
      [sceneId, projectId],
    );
  }, { pool });

  const [projectRows] = await pool.query('SELECT COUNT(*) AS c FROM projects WHERE id = ?', [projectId]);
  assert.equal(Number(projectRows[0].c), 1, 'project row must be committed');
  const [sceneRows] = await pool.query('SELECT COUNT(*) AS c FROM scenes WHERE id = ?', [sceneId]);
  assert.equal(Number(sceneRows[0].c), 1, 'scene row must be committed');
});

test('subtree failure rolls back the parent — no orphan project row on scene insert failure', async (t) => {
  if (!requireMysql(t)) return;

  const profileId = await makeProfile();
  const projectId = randomUUID();
  const sceneId = randomUUID();
  created.push(projectId);

  await assert.rejects(
    () =>
      withTransaction(async (connection) => {
        await connection.execute(
          "INSERT INTO projects (id, owner_id, title, visibility, moderation_status, revision) VALUES (?, ?, 'parent', 'private', 'draft', 0)",
          [projectId, profileId],
        );
        // Force a duplicate primary key failure on the scene insert.
        await connection.execute(
          "INSERT INTO scenes (id, project_id, name, order_index) VALUES (?, ?, 'A', 0)",
          [sceneId, projectId],
        );
        await connection.execute(
          "INSERT INTO scenes (id, project_id, name, order_index) VALUES (?, ?, 'B', 1)",
          [sceneId, projectId],
        );
      }, { pool }),
    /ER_DUP_ENTRY|Duplicate entry/i,
  );

  const [projectRows] = await pool.query('SELECT COUNT(*) AS c FROM projects WHERE id = ?', [projectId]);
  assert.equal(Number(projectRows[0].c), 0, 'parent project must rollback when a child insert fails');
});

// --- Compat writer precondition contract ---------------------------------

function fakeHeaders(map) {
  return { get: (name) => map[name.toLowerCase()] ?? null };
}

test('parseIfMatchRevision accepts the RFC-7232 form and rejects anything else', () => {
  assert.equal(parseIfMatchRevision('"42"'), 42);
  assert.equal(parseIfMatchRevision('"0"'), 0);
  assert.equal(parseIfMatchRevision('42'), 42, 'bare integer accepted as convenience');
  assert.equal(parseIfMatchRevision('W/"7"'), 7, 'weak validators accepted');
  assert.equal(parseIfMatchRevision('"abc"'), null);
  assert.equal(parseIfMatchRevision('*'), null, 'wildcard is not a revision');
  assert.equal(parseIfMatchRevision(null), null);
  assert.equal(parseIfMatchRevision(''), null);
  assert.equal(parseIfMatchRevision('"-1"'), null, 'negative is rejected');
});

test('buildCompatEnvelope throws PreconditionRequired when Idempotency-Key is missing', () => {
  const request = { headers: fakeHeaders({ 'if-match': '"1"' }) };
  assert.throws(
    () =>
      buildCompatEnvelope({
        request,
        command: { type: 'scene.delete', sceneId: randomUUID() },
      }),
    (error) => error instanceof PreconditionRequired && error.header === 'Idempotency-Key',
  );
});

test('buildCompatEnvelope throws PreconditionRequired when If-Match is missing and requireIfMatch is true', () => {
  const request = { headers: fakeHeaders({ 'idempotency-key': 'idem-1234567890abcdef' }) };
  assert.throws(
    () =>
      buildCompatEnvelope({
        request,
        command: { type: 'scene.delete', sceneId: randomUUID() },
      }),
    (error) => error instanceof PreconditionRequired && error.header === 'If-Match',
  );
});

test('buildCompatEnvelope allows missing If-Match when the caller opts out (creation path)', () => {
  const request = { headers: fakeHeaders({ 'idempotency-key': 'idem-1234567890abcdef' }) };
  const envelope = buildCompatEnvelope({
    request,
    command: { type: 'scene.delete', sceneId: randomUUID() },
    requireIfMatch: false,
  });
  assert.equal(envelope.expectedRevision, undefined);
  assert.equal(envelope.idempotencyKey, 'idem-1234567890abcdef');
});

test('buildCompatEnvelope carries the parsed revision and headers into the envelope', () => {
  const request = {
    headers: fakeHeaders({
      'idempotency-key': 'idem-1234567890abcdef',
      'if-match': '"5"',
      'x-editing-session': '11111111-1111-4111-8111-111111111111',
      'x-command-group': 'compat-group-7',
    }),
  };
  const command = { type: 'scene.delete', sceneId: randomUUID() };
  const envelope = buildCompatEnvelope({ request, command });
  assert.equal(envelope.expectedRevision, 5);
  assert.equal(envelope.editingSessionId, '11111111-1111-4111-8111-111111111111');
  assert.equal(envelope.groupId, 'compat-group-7');
  assert.equal(envelope.command, command);
});

test('short Idempotency-Key is rejected — same rule the schema enforces at parse time', () => {
  const request = {
    headers: fakeHeaders({ 'idempotency-key': 'short', 'if-match': '"0"' }),
  };
  assert.throws(
    () =>
      buildCompatEnvelope({
        request,
        command: { type: 'scene.delete', sceneId: randomUUID() },
      }),
    (error) => error instanceof PreconditionRequired && error.header === 'Idempotency-Key',
  );
});
