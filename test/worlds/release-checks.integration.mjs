import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runWorldReleaseChecks } = require('../.build/lib/worlds/releaseChecks.js');
const { getWorldTemplate, materializeTemplateObjectProperties } = require('../.build/lib/worlds/templates.js');
process.env.RELEASE_CHECK_FIXTURES_ONLY = '1';
const { validSnapshot, validContext, snapshotHash } = require('./release-checks.test.js');

function checkByName(results, name) {
  const result = results.find((candidate) => candidate.name === name);
  assert.ok(result, `expected fixed check ${name}`);
  return result;
}

function uuid(prefix, index) {
  return `${String(prefix + index).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

function serializeBlock(block) {
  return {
    inputs: block.inputs ?? {},
    ...(block.children ? { children: block.children.map(serializeNestedBlock) } : {}),
    ...(block.elseChildren ? { elseChildren: block.elseChildren.map(serializeNestedBlock) } : {}),
  };
}

function serializeNestedBlock(block) {
  return {
    id: block.id,
    block_type: block.block_type,
    ...serializeBlock(block),
  };
}

function currentTemplateSnapshot() {
  const template = getWorldTemplate('platformer', 2);
  assert.ok(template?.active, 'fixture must use the active catalog template');
  const projectId = uuid(1, 0);
  let objectIndex = 0;
  let blockIndex = 0;
  return {
    project: {
      id: projectId, owner_id: uuid(2, 0), title: 'Sky Steps Remix', description: 'A friendly climb.',
      thumbnail_url: template.cardArt, visibility: 'private', genre: template.genre,
      is_published: false, moderation_status: 'draft', revision: 3,
    },
    scenes: template.scenes.map((scene, sceneIndex) => {
      const sceneId = uuid(3, sceneIndex);
      return {
        id: sceneId, project_id: projectId, name: scene.name, order_index: sceneIndex,
        background_color: scene.backgroundColor, background_image_url: scene.backgroundImageUrl,
        lighting_preset: null, physics_enabled: true, gravity_y: -9.8,
        objects: scene.objects.map((object, index) => {
          const objectId = uuid(4, objectIndex++);
          return {
            id: objectId, scene_id: sceneId, type: object.type, name: object.name,
            position_x: object.position[0], position_y: object.position[1], position_z: object.position[2],
            rotation: 0, scale_x: 1, scale_y: 1, sprite_url: null, color: object.color ?? null,
            width: null, height: null, has_physics: false, is_static: false, mass: 1,
            properties: materializeTemplateObjectProperties(object), order_index: index,
            logic_blocks: object.blocks.map((block, blockOrder) => ({
              id: uuid(5, blockIndex++), game_object_id: objectId, project_id: projectId, scene_id: sceneId,
              block_type: block.block_type, category: 'runtime', parent_block_id: null, order_index: blockOrder,
              block_data: serializeBlock(block),
            })),
          };
        }),
      };
    }),
    assets: [],
  };
}

test('accepts a snapshot materialized from the active current template catalog', async () => {
  const snapshot = currentTemplateSnapshot();
  const results = await runWorldReleaseChecks(snapshot, validContext(snapshot));
  assert.equal(results.every((result) => result.status === 'passed'), true);
});

test('accepts the packaged Minion model path through the real model policy', async () => {
  const snapshot = validSnapshot();
  const results = await runWorldReleaseChecks(snapshot, validContext(snapshot));

  assert.deepEqual(checkByName(results, 'asset_policy'), {
    name: 'asset_policy', status: 'passed', reasonCode: null,
  });
});

test('fails closed for malformed blocks, empty scenes, and snapshot hash drift', async () => {
  const malformed = validSnapshot();
  malformed.scenes[0].objects[0].logic_blocks[1].block_data = { inputs: { direction: 'up', distance: { unsafe: true } } };
  assert.deepEqual(checkByName(await runWorldReleaseChecks(malformed, validContext(malformed)), 'block_policy'), {
    name: 'block_policy', status: 'failed', reasonCode: 'block_data_invalid',
  });

  const empty = validSnapshot();
  empty.scenes = [];
  const emptyContext = validContext(empty);
  assert.deepEqual(checkByName(await runWorldReleaseChecks(empty, emptyContext), 'playability'), {
    name: 'playability', status: 'failed', reasonCode: 'scene_missing',
  });

  const drift = validSnapshot();
  const driftContext = { ...validContext(drift), snapshotHash: snapshotHash({ ...drift, project: { ...drift.project, title: 'different' } }) };
  assert.deepEqual(checkByName(await runWorldReleaseChecks(drift, driftContext), 'snapshot_integrity'), {
    name: 'snapshot_integrity', status: 'failed', reasonCode: 'snapshot_hash_mismatch',
  });
});

test('rejects unsupported blocks and snapshots over the active template budget', async () => {
  const unsupported = validSnapshot();
  unsupported.scenes[0].objects[0].logic_blocks[1].block_type = 'run_unreviewed_code';
  assert.deepEqual(checkByName(await runWorldReleaseChecks(unsupported, validContext(unsupported)), 'block_policy'), {
    name: 'block_policy', status: 'failed', reasonCode: 'block_type_unsupported',
  });

  const overBudget = validSnapshot();
  overBudget.scenes = Array.from({ length: 4 }, (_, index) => ({
    ...overBudget.scenes[0],
    id: `${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}${index + 3}-3333-4333-8333-333333333333`,
  }));
  assert.deepEqual(checkByName(await runWorldReleaseChecks(overBudget, validContext(overBudget)), 'project_budgets'), {
    name: 'project_budgets', status: 'failed', reasonCode: 'budget_exceeded',
  });
});

test('converts an unexpected check exception into the fixed check_error code', async () => {
  const snapshot = validSnapshot();
  const context = {
    ...validContext(snapshot),
    moderateText: async () => { throw new Error('provider detail must not escape'); },
  };

  assert.deepEqual(checkByName(await runWorldReleaseChecks(snapshot, context), 'public_metadata'), {
    name: 'public_metadata', status: 'error', reasonCode: 'check_error',
  });
});
