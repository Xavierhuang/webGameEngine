'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.startsWith('@/')) return originalLoad(path.join(ROOT, request.slice(2)), parent, isMain);
  return originalLoad(request, parent, isMain);
};
const { createReleaseRemixService } = require(path.join(ROOT, 'lib/worlds/releaseRemix.ts'));
const { hashProjectSnapshot } = require(path.join(ROOT, 'lib/projects/projectSnapshot.ts'));
Module._load = originalLoad;

const USER = { kind: 'user', userId: 'user-1', profileId: 'profile-remixer' };
const GUEST = { kind: 'guest', profileId: 'profile-guest', sessionId: 'session-1' };
const ANONYMOUS = { kind: 'anonymous' };

const RELEASE_ID = 'release-1';
const SOURCE_PROJECT_ID = 'project-source';
const SNAPSHOT_ID = 'snapshot-1';

/**
 * A snapshot with a genuinely nested block tree. The legacy remix path drops
 * `parent_block_id`, which silently flattens control flow; this fixture is
 * shaped so that mistake would be visible.
 */
function nestedSnapshot() {
  const snapshot = {
    project: {
      id: SOURCE_PROJECT_ID, owner_id: 'profile-owner', title: 'Nested World',
      description: 'has control flow', thumbnail_url: '/backdrops/blue-sky.svg',
      visibility: 'private', genre: 'platformer', is_published: false,
      moderation_status: 'draft', revision: 7,
    },
    scenes: [{
      id: 'scene-a', project_id: SOURCE_PROJECT_ID, name: 'Scene A', order_index: 0,
      background_color: '#fff', background_image_url: null, lighting_preset: null,
      physics_enabled: true, gravity_y: -9.8,
      objects: [{
        id: 'object-a', scene_id: 'scene-a', type: 'character', name: 'Hero',
        position_x: 0, position_y: 0, position_z: 0, rotation: 0, scale_x: 1, scale_y: 1,
        sprite_url: null, color: null, width: null, height: null,
        has_physics: false, is_static: false, mass: 1, properties: {}, order_index: 0,
        logic_blocks: [
          { id: 'block-parent', game_object_id: 'object-a', project_id: SOURCE_PROJECT_ID, scene_id: 'scene-a', block_type: 'control_repeat', category: 'runtime', parent_block_id: null, order_index: 0, block_data: { inputs: {} } },
          { id: 'block-child', game_object_id: 'object-a', project_id: SOURCE_PROJECT_ID, scene_id: 'scene-a', block_type: 'motion_move', category: 'runtime', parent_block_id: 'block-parent', order_index: 1, block_data: { inputs: {} } },
          { id: 'block-orphan', game_object_id: 'object-missing', project_id: SOURCE_PROJECT_ID, scene_id: 'scene-a', block_type: 'motion_move', category: 'runtime', parent_block_id: null, order_index: 2, block_data: { inputs: {} } },
        ],
      }],
    }],
    assets: [{ id: 'asset-a', asset_type: 'image', name: 'Cloud', file_url: '/uploads/textures/cloud.png', mime_type: 'image/png', blob_checksum: null }],
  };
  return snapshot;
}

/**
 * A fake connection that records every statement. `overrides` lets a test bend
 * one lookup — a missing release, a drifted hash — without restating the rest.
 */
function fakeDatabase({ release, snapshotJson, snapshotHash, revision, assetRows = [] } = {}) {
  const statements = [];
  let uuidCounter = 0;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql, values = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      statements.push({ sql: normalized, values });
      if (normalized.startsWith('select id, project_id, project_play_snapshot_id')) {
        return [release === null ? [] : [release]];
      }
      if (normalized.startsWith('select snapshot_json')) {
        if (snapshotJson === null) return [[]];
        return [[{ snapshot_json: snapshotJson, snapshot_sha256: snapshotHash, revision }]];
      }
      if (normalized.startsWith('select id, file_size from assets')) return [assetRows];
      return [{ affectedRows: 1 }];
    },
  };
  const service = createReleaseRemixService({
    pool: { async getConnection() { return connection; } },
    uuid: () => `uuid-${String(++uuidCounter).padStart(3, '0')}`,
  });
  return { service, statements };
}

function publishedRelease() {
  return {
    id: RELEASE_ID, project_id: SOURCE_PROJECT_ID, project_play_snapshot_id: SNAPSHOT_ID,
    template_id: 'platformer', template_version: 2, project_revision: 7,
    snapshot_sha256: hashProjectSnapshot(nestedSnapshot()),
  };
}

function workingDatabase(extra = {}) {
  const snapshot = nestedSnapshot();
  return fakeDatabase({
    release: publishedRelease(),
    snapshotJson: JSON.stringify(snapshot),
    snapshotHash: hashProjectSnapshot(snapshot),
    revision: 7,
    assetRows: [{ id: 'asset-a', file_size: 4096 }],
    ...extra,
  });
}

test('an anonymous visitor cannot remix, and a guest with a profile can', async () => {
  const { service, statements } = workingDatabase();
  await assert.rejects(
    () => service.remixWorldRelease({ actor: ANONYMOUS, releaseId: RELEASE_ID }),
    (error) => error.name === 'ReleaseServiceError' && error.code === 'release_auth_forbidden' && error.status === 403,
  );
  assert.equal(statements.length, 0, 'an anonymous caller never opens a transaction');

  const guestRun = workingDatabase();
  const result = await guestRun.service.remixWorldRelease({ actor: GUEST, releaseId: RELEASE_ID });
  assert.equal(result.project.visibility, 'private');
  const insert = guestRun.statements.find((s) => s.sql.startsWith('insert into projects'));
  assert.equal(insert.values[1], GUEST.profileId, 'the guest profile owns the copy');
});

test('a malformed release id is rejected before any query runs', async () => {
  for (const releaseId of ['', 'x'.repeat(65), null, undefined, 42, {}]) {
    const { service, statements } = workingDatabase();
    await assert.rejects(
      () => service.remixWorldRelease({ actor: USER, releaseId }),
      (error) => error.name === 'ReleaseServiceError' && error.code === 'invalid_release_input',
      `release id ${JSON.stringify(releaseId)} must be rejected`,
    );
    assert.equal(statements.length, 0);
  }
});

test('only a currently public release is remixable', async () => {
  // The SQL predicate itself is the boundary, so assert it rather than trusting
  // a caller to have filtered first.
  const { service, statements } = workingDatabase({ release: null });
  await assert.rejects(
    () => service.remixWorldRelease({ actor: USER, releaseId: RELEASE_ID }),
    (error) => error.code === 'release_not_found' && error.status === 404,
  );
  const lookup = statements[0].sql;
  assert.match(lookup, /status = 'published'/);
  assert.match(lookup, /current_public = true/);
  assert.match(lookup, /for update/, 'the release is locked so a takedown cannot race the copy');
});

test('a snapshot whose stored bytes drifted from the approved hash is refused', async () => {
  const drifted = nestedSnapshot();
  drifted.project.title = 'Tampered After Approval';
  const { service } = workingDatabase({ snapshotJson: JSON.stringify(drifted) });
  await assert.rejects(
    () => service.remixWorldRelease({ actor: USER, releaseId: RELEASE_ID }),
    (error) => error.code === 'snapshot_integrity_failed' && error.status === 422,
  );

  const missing = workingDatabase({ snapshotJson: null });
  await assert.rejects(
    () => missing.service.remixWorldRelease({ actor: USER, releaseId: RELEASE_ID }),
    (error) => error.code === 'snapshot_unavailable',
  );

  const wrongRevision = workingDatabase({ revision: 8 });
  await assert.rejects(
    () => wrongRevision.service.remixWorldRelease({ actor: USER, releaseId: RELEASE_ID }),
    (error) => error.code === 'snapshot_integrity_failed',
  );
});

test('nested block structure survives the copy with remapped parent ids', async () => {
  const { service, statements } = workingDatabase();
  await service.remixWorldRelease({ actor: USER, releaseId: RELEASE_ID });

  const blockInserts = statements.filter((s) => s.sql.startsWith('insert into logic_blocks'));
  assert.equal(blockInserts.length, 2, 'the orphaned block is dropped rather than reattached');

  const [parent, child] = blockInserts;
  const [parentId, , , , parentType, , parentParent] = parent.values;
  const [childId, , , , childType, , childParent] = child.values;

  assert.equal(parentType, 'control_repeat');
  assert.equal(childType, 'motion_move');
  assert.equal(parentParent, null, 'a root block stays rooted');
  assert.equal(childParent, parentId, 'the child points at the NEW parent id, not the source id');
  assert.notEqual(childParent, 'block-parent', 'a source block id must never survive into the copy');
  assert.notEqual(parentId, 'block-parent');
  assert.notEqual(childId, 'block-child');
});

test('the copy is built from the snapshot and starts private with full lineage', async () => {
  const { service, statements } = workingDatabase();
  const result = await service.remixWorldRelease({ actor: USER, releaseId: RELEASE_ID });

  const projectInsert = statements.find((s) => s.sql.startsWith('insert into projects'));
  const [projectId, ownerId, remixedFrom, sourceReleaseId, title, description, genre, thumbnail] = projectInsert.values;
  assert.equal(ownerId, USER.profileId);
  assert.equal(remixedFrom, SOURCE_PROJECT_ID);
  assert.equal(sourceReleaseId, RELEASE_ID);
  assert.equal(title, 'Nested World (remix)');
  assert.equal(description, 'has control flow');
  assert.equal(genre, 'platformer');
  assert.equal(thumbnail, '/backdrops/blue-sky.svg');
  assert.match(projectInsert.sql, /'private', false, 'draft'/);
  assert.equal(result.project.id, projectId);

  // World identity comes from the release row, not from `project_worlds`.
  const worldInsert = statements.find((s) => s.sql.startsWith('insert into project_worlds'));
  assert.deepEqual(worldInsert.values, [projectId, 'platformer', 2]);
  assert.equal(statements.some((s) => s.sql.includes('from project_worlds')), false,
    'the remix never reads the source project_worlds row');

  // The mutable source graph is never read.
  for (const table of ['from scenes', 'from game_objects', 'from logic_blocks']) {
    assert.equal(statements.some((s) => s.sql.includes(table)), false,
      `the remix must not read live ${table}`);
  }

  const assetInsert = statements.find((s) => s.sql.startsWith('insert into assets'));
  assert.equal(assetInsert.values[2], USER.profileId, 'the remixer owns the copied asset');
  assert.equal(assetInsert.values[5], '/uploads/textures/cloud.png');
  assert.equal(assetInsert.values[6], 4096, 'durable file size carries across so budgets stay checkable');

  const counter = statements.find((s) => s.sql.startsWith('update projects set remix_count'));
  assert.deepEqual(counter.values, [SOURCE_PROJECT_ID]);
  assert.ok(
    statements.indexOf(counter) > statements.indexOf(assetInsert),
    'the counter advances only after the copy succeeded',
  );
});

test('an asset with no resolvable durable size copies as null rather than a guess', async () => {
  for (const assetRows of [[], [{ id: 'asset-a', file_size: null }], [{ id: 'asset-a', file_size: -1 }], [{ id: 'asset-a', file_size: 1.5 }]]) {
    const { service, statements } = workingDatabase({ assetRows });
    await service.remixWorldRelease({ actor: USER, releaseId: RELEASE_ID });
    const assetInsert = statements.find((s) => s.sql.startsWith('insert into assets'));
    assert.equal(assetInsert.values[6], null,
      `an unusable source size ${JSON.stringify(assetRows)} must not become a fabricated byte count`);
  }
});
