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
const originalLoad = Module._load;
Module._resolveFilename = function resolveCompiledAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename(resolve('test/.build', `${request.slice(2)}.js`), parent, isMain, options);
  }
  return originalResolveFilename(request, parent, isMain, options);
};
Module._load = function loadServiceModerationStub(request, parent, isMain) {
  if (request === '../safety/moderation' && parent?.filename.endsWith('/lib/worlds/templateService.js')) {
    return {
      sanitizeUserInput: (value) => value.replace(/<[^>]*>/g, '').trim(),
      moderateText: async (value) => ({ safe: !/\bnude\b/i.test(value) }),
    };
  }
  return originalLoad(request, parent, isMain);
};

const DB_NAME = process.env.MYSQL_DATABASE || 'gameengine_test';
if (!DB_NAME.includes('_test')) {
  throw new Error(`Refusing to run world-template tests against ${DB_NAME}; database name must contain _test`);
}

let pool = null;
let mysqlUnavailableReason = null;
const createdProjectIds = [];
const createdProfileIds = [];

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
    // The production migration deliberately selects gameengine because
    // setup-db starts a fresh mysql process per file. This pool has already
    // selected the guarded _test database, so keep that selection for tests.
    await pool.query(migration.replace(/^USE gameengine;\s*$/m, ''));
  } catch (error) {
    mysqlUnavailableReason = error instanceof Error ? error.message : String(error);
    await pool?.end().catch(() => {});
    pool = null;
  }
});

test.after(async () => {
  if (!pool) return;
  for (const projectId of createdProjectIds) {
    await pool.query('DELETE FROM world_mission_progress WHERE project_id = ?', [projectId]).catch(() => {});
    await pool.query('DELETE FROM project_worlds WHERE project_id = ?', [projectId]).catch(() => {});
    await pool.query('DELETE FROM logic_blocks WHERE project_id = ?', [projectId]).catch(() => {});
    await pool.query('DELETE FROM projects WHERE id = ?', [projectId]).catch(() => {});
  }
  for (const profileId of createdProfileIds) {
    await pool.query('DELETE FROM profiles WHERE id = ?', [profileId]).catch(() => {});
  }
  await pool.end();
});

function requireMysql(t) {
  if (pool) return true;
  t.skip(`MySQL not reachable or migration unavailable: ${mysqlUnavailableReason}`);
  return false;
}

async function makeActor() {
  const profileId = randomUUID();
  createdProfileIds.push(profileId);
  await pool.query(
    "INSERT INTO profiles (id, user_id, profile_kind, display_name, role) VALUES (?, NULL, 'guest', 'world test', 'child')",
    [profileId],
  );
  return { kind: 'guest', profileId, sessionId: randomUUID() };
}

function countTopLevelTemplateBlocks(template) {
  return template.scenes
    .flatMap((scene) => scene.objects)
    .reduce((total, object) => total + object.blocks.length, 0);
}

test('migration declares the private world identity and mission progress tables', async () => {
  const migration = await readFile(resolve('migrations/011_world_builder.sql'), 'utf8');
  assert.match(migration, /^USE gameengine;\s*$/m, 'setup-db runs each migration in a fresh mysql process');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS world_templates/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS project_worlds/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS world_mission_progress/i);
  assert.match(migration, /PRIMARY KEY\s*\(template_id, version\)/i);
  assert.match(migration, /PRIMARY KEY\s*\(project_id, mission_id\)/i);
  assert.match(migration, /status ENUM\('not_started', 'in_progress', 'completed'\)/i);
});

test('serialized template block data preserves child and else branches for the existing reader', async () => {
  const { serializeWorldTemplateBlock } = await import('../.build/lib/worlds/templateService.js');
  const { normalizeDbBlocks } = await import('../.build/lib/blockly/serializer.js');
  const persisted = serializeWorldTemplateBlock({
    id: 'if-source',
    block_type: 'if_then',
    inputs: { condition: { op: 'literal', value: true } },
    children: [{ id: 'then-source', block_type: 'rotate', inputs: { x: 0, y: 5, z: 0 } }],
    elseChildren: [{ id: 'else-source', block_type: 'say', inputs: { text: 'try again' } }],
  });
  assert.equal(persisted.children[0].block_type, 'rotate');
  assert.equal(persisted.elseChildren[0].block_type, 'say', 'elseChildren is an explicit persisted branch');

  const reloaded = normalizeDbBlocks([{
    id: 'row-if', block_type: 'if_then', category: 'control', order_index: 0,
    block_data: persisted,
  }]);
  assert.equal(reloaded.length, 1, 'nested children and elseChildren must not become top-level rows');
  const [reloadedParent] = reloaded;
  assert.equal(reloadedParent.children[0].block_type, 'rotate');
  assert.equal(reloadedParent.elseChildren[0].block_type, 'say');
});

test('lists only the active Sky Steps version while keeping v1 resolvable for existing worlds', async () => {
  const { isWorldTemplateActive, listWorldTemplateDtos } = await import('../.build/lib/worlds/templateService.js');
  const { getWorldTemplate } = await import('../.build/lib/worlds/templates.js');
  const platformers = listWorldTemplateDtos().filter((template) => template.id === 'platformer');

  assert.deepEqual(
    platformers.map(({ id, version }) => ({ id, version })),
    [{ id: 'platformer', version: 2 }],
    'the normal creation catalog offers only the current Sky Steps version',
  );
  assert.equal(getWorldTemplate('platformer', 1)?.version, 1, 'existing v1 projects still resolve by their persisted version');
  assert.equal(isWorldTemplateActive('platformer', 1), false, 'v1 is never offered for ordinary creation');
  assert.equal(isWorldTemplateActive('platformer', 2), true, 'v2 is accepted by ordinary creation');
});

test('materializes an approved template as a private draft with its complete graph', async (t) => {
  if (!requireMysql(t)) return;
  const { createWorldFromTemplate } = await import('../.build/lib/worlds/templateService.js');
  const { getWorldTemplate } = await import('../.build/lib/worlds/templates.js');
  const actor = await makeActor();
  const template = getWorldTemplate('platformer', 1);
  assert.ok(template);

  const created = await createWorldFromTemplate({
    actor,
    templateId: 'platformer',
    templateVersion: 1,
    title: 'Sky Steps',
  }, { pool });
  createdProjectIds.push(created.projectId);

  assert.deepEqual(
    { revision: created.revision, templateId: created.templateId, templateVersion: created.templateVersion },
    { revision: 0, templateId: 'platformer', templateVersion: 1 },
  );

  const [[project]] = await pool.query(
    'SELECT visibility, is_published, moderation_status FROM projects WHERE id = ?', [created.projectId],
  );
  assert.equal(project.visibility, 'private');
  assert.equal(Number(project.is_published), 0);
  assert.equal(project.moderation_status, 'draft');

  const [[projectWorld]] = await pool.query(
    'SELECT template_id, template_version FROM project_worlds WHERE project_id = ?', [created.projectId],
  );
  assert.equal(projectWorld.template_id, 'platformer');
  assert.equal(Number(projectWorld.template_version), 1);
  const [[catalogRow]] = await pool.query(
    'SELECT active FROM world_templates WHERE template_id = ? AND version = ?', ['platformer', 1],
  );
  assert.equal(Number(catalogRow.active), 0, 'a direct compatibility materialization keeps Sky Steps v1 inactive');

  const [[sceneCount]] = await pool.query('SELECT COUNT(*) AS count FROM scenes WHERE project_id = ?', [created.projectId]);
  const [[objectCount]] = await pool.query(
    'SELECT COUNT(*) AS count FROM game_objects WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)',
    [created.projectId],
  );
  const [[blockCount]] = await pool.query('SELECT COUNT(*) AS count FROM logic_blocks WHERE project_id = ?', [created.projectId]);
  assert.equal(Number(sceneCount.count), template.scenes.length);
  assert.equal(Number(objectCount.count), template.scenes.flatMap((scene) => scene.objects).length);
  assert.equal(
    Number(blockCount.count),
    countTopLevelTemplateBlocks(template),
  );
});

test('materializes the active Sky Steps v2 route with raised steps and its goal objects', async (t) => {
  if (!requireMysql(t)) return;
  const { createWorldFromTemplate } = await import('../.build/lib/worlds/templateService.js');
  const actor = await makeActor();
  const created = await createWorldFromTemplate({
    actor,
    templateId: 'platformer',
    templateVersion: 2,
    title: 'Fresh Sky Steps',
  }, { pool });
  createdProjectIds.push(created.projectId);

  assert.deepEqual(
    { templateId: created.templateId, templateVersion: created.templateVersion },
    { templateId: 'platformer', templateVersion: 2 },
  );
  const [[identity]] = await pool.query(
    'SELECT template_id, template_version FROM project_worlds WHERE project_id = ?', [created.projectId],
  );
  assert.deepEqual(
    { templateId: identity.template_id, templateVersion: Number(identity.template_version) },
    { templateId: 'platformer', templateVersion: 2 },
  );
  const [[catalogRow]] = await pool.query(
    'SELECT active FROM world_templates WHERE template_id = ? AND version = ?', ['platformer', 2],
  );
  assert.equal(Number(catalogRow.active), 1, 'the active Sky Steps catalog row stays active after materialization');

  const [objects] = await pool.query(
    `SELECT name, type, position_y
       FROM game_objects
       WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)
       ORDER BY order_index`,
    [created.projectId],
  );
  const byName = new Map(objects.map((object) => [object.name, object]));
  for (const name of ['Sky Step One', 'Sky Step Two', 'Sky Step Three']) {
    assert.equal(byName.get(name)?.type, 'platform', `${name} is a platform`);
  }
  assert.ok(Number(byName.get('Sky Step One')?.position_y) > -2, 'the first Sky Step is raised above the start island');
  for (const name of ['Sky Star One', 'Sky Star Two', 'Sky Star Three']) {
    assert.equal(byName.get(name)?.type, 'collectible', `${name} is materialized`);
  }
  assert.equal(byName.get('Sky Cloud')?.type, 'obstacle');
  assert.equal(byName.get('Sky Portal')?.type, 'sprite');
});

test('Obby forever block reloads its rotate child from persisted block_data', async (t) => {
  if (!requireMysql(t)) return;
  const { createWorldFromTemplate } = await import('../.build/lib/worlds/templateService.js');
  const { normalizeDbBlocks } = await import('../.build/lib/blockly/serializer.js');
  const actor = await makeActor();
  const created = await createWorldFromTemplate({
    actor,
    templateId: 'obby',
    templateVersion: 1,
    title: 'Rainbow Obby',
  }, { pool });
  createdProjectIds.push(created.projectId);
  const [rows] = await pool.query(
    `SELECT lb.id, lb.block_type, lb.category, lb.order_index, lb.block_data
      FROM logic_blocks lb
      INNER JOIN game_objects object_row ON object_row.id = lb.game_object_id
      WHERE lb.project_id = ? AND object_row.name = 'Bouncy Bumper'`,
    [created.projectId],
  );
  const reloaded = normalizeDbBlocks(rows);
  assert.equal(rows.length, 1, 'the nested rotate block must exist only inside forever.block_data');
  assert.equal(reloaded.length, 1, 'reloading must not duplicate rotate as a top-level block');
  const [forever] = reloaded;
  assert.equal(forever.block_type, 'forever');
  assert.equal(forever.children[0].block_type, 'rotate');
});

test('a graph insertion failure rolls back all template-world rows', async (t) => {
  if (!requireMysql(t)) return;
  const { createWorldFromTemplate } = await import('../.build/lib/worlds/templateService.js');
  const actor = await makeActor();
  let projectId = null;
  const baseConnection = await pool.getConnection();
  baseConnection.release();
  let firstObjectInsertSeen = false;
  const failingPool = {
    async getConnection() {
      const connection = await pool.getConnection();
      return new Proxy(connection, {
        get(target, property, receiver) {
          if (property !== 'execute') return Reflect.get(target, property, receiver);
          return async (sql, params) => {
            if (/INSERT INTO projects/i.test(sql)) projectId = params[0];
            if (/INSERT INTO game_objects/i.test(sql)) {
              if (firstObjectInsertSeen) throw new Error('injected graph insertion failure');
              firstObjectInsertSeen = true;
            }
            return target.execute(sql, params);
          };
        },
      });
    },
  };

  await assert.rejects(
    () => createWorldFromTemplate({
      actor,
      templateId: 'platformer',
      templateVersion: 1,
      title: 'Rollback world',
    }, { pool: failingPool }),
    /injected graph insertion failure/,
  );
  assert.ok(projectId, 'the service must generate the project UUID on the server');
  createdProjectIds.push(projectId);
  for (const [table, column] of [
    ['projects', 'id'],
    ['project_worlds', 'project_id'],
    ['scenes', 'project_id'],
    ['logic_blocks', 'project_id'],
  ]) {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`, [projectId]);
    assert.equal(Number(row.count), 0, `${table} must roll back`);
  }
  const [[objectRow]] = await pool.query(
    'SELECT COUNT(*) AS count FROM game_objects WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)',
    [projectId],
  );
  assert.equal(Number(objectRow.count), 0, 'game_objects must roll back');
});

test('rejects anonymous callers, missing template versions, and unsafe titles before a write', async () => {
  const { createWorldFromTemplate, WorldTemplateCreationError } = await import('../.build/lib/worlds/templateService.js');
  await assert.rejects(
    () => createWorldFromTemplate({ actor: { kind: 'anonymous' }, templateId: 'platformer', templateVersion: 1, title: 'Sky Steps' }),
    (error) => error instanceof WorldTemplateCreationError && error.status === 401,
  );
  await assert.rejects(
    () => createWorldFromTemplate({ actor: { kind: 'guest', profileId: randomUUID(), sessionId: randomUUID() }, templateId: 'missing', templateVersion: 1, title: 'Sky Steps' }),
    (error) => error instanceof WorldTemplateCreationError && error.status === 422,
  );
  await assert.rejects(
    () => createWorldFromTemplate({ actor: { kind: 'guest', profileId: randomUUID(), sessionId: randomUUID() }, templateId: 'platformer', templateVersion: 1, title: 'nude world' }),
    (error) => error instanceof WorldTemplateCreationError && error.status === 422,
  );
});
