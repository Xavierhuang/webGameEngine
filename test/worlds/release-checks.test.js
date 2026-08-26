const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');

let releaseChecks = {};
try {
  releaseChecks = require('../.build/lib/worlds/releaseChecks.js');
} catch {
  // The first TDD run intentionally reaches this branch: production code is
  // absent, and the assertion below proves the public contract is missing.
}

const { runWorldReleaseChecks, isWorldReleaseReviewable } = releaseChecks;

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`)
    .join(',')}}`;
}

function snapshotHash(snapshot) {
  return createHash('sha256').update(canonicalStringify(snapshot)).digest('hex');
}

function validSnapshot() {
  return {
    project: {
      id: '11111111-1111-4111-8111-111111111111',
      owner_id: '22222222-2222-4222-8222-222222222222',
      title: 'Minion Steps',
      description: 'A friendly obstacle course.',
      thumbnail_url: '/backdrops/blue-sky.svg',
      visibility: 'private',
      genre: 'Platformer',
      is_published: false,
      moderation_status: 'draft',
      revision: 7,
    },
    scenes: [{
      id: '33333333-3333-4333-8333-333333333333',
      project_id: '11111111-1111-4111-8111-111111111111',
      name: 'Main',
      order_index: 0,
      background_color: '#8ed7ff',
      background_image_url: '/backdrops/blue-sky.svg',
      lighting_preset: null,
      physics_enabled: true,
      gravity_y: -9.8,
      objects: [{
        id: '44444444-4444-4444-8444-444444444444',
        scene_id: '33333333-3333-4333-8333-333333333333',
        type: 'character',
        name: 'Minion Hero',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        rotation: 0,
        scale_x: 1,
        scale_y: 1,
        sprite_url: null,
        color: null,
        width: null,
        height: null,
        has_physics: true,
        is_static: false,
        mass: 1,
        properties: { shape: 'model', model_url: '/models/minion/FBX/Minion_FBX.fbx', playerControlled: true },
        order_index: 0,
        logic_blocks: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            game_object_id: '44444444-4444-4444-8444-444444444444',
            project_id: '11111111-1111-4111-8111-111111111111',
            scene_id: '33333333-3333-4333-8333-333333333333',
            block_type: 'on_key_press',
            category: 'event',
            parent_block_id: null,
            order_index: 0,
            block_data: { inputs: { key: 'ArrowUp' } },
          },
          {
            id: '66666666-6666-4666-8666-666666666666',
            game_object_id: '44444444-4444-4444-8444-444444444444',
            project_id: '11111111-1111-4111-8111-111111111111',
            scene_id: '33333333-3333-4333-8333-333333333333',
            block_type: 'move',
            category: 'action',
            parent_block_id: null,
            order_index: 1,
            block_data: { inputs: { direction: 'up', distance: 1 } },
          },
        ],
      }],
    }],
    assets: [],
  };
}

function validContext(snapshot) {
  return {
    templateId: 'platformer',
    templateVersion: 2,
    sourceRevision: snapshot.project.revision,
    snapshotHash: snapshotHash(snapshot),
    creatorLabel: 'Builder',
  };
}

if (!process.env.RELEASE_CHECK_FIXTURES_ONLY) {
  test('runs every fixed release check for a valid snapshot', async () => {
    // Break caught: removing a check or allowing a release without the public
    // validation API would make this candidate appear reviewable.
    assert.equal(typeof runWorldReleaseChecks, 'function');

    const snapshot = validSnapshot();
    const results = await runWorldReleaseChecks(snapshot, validContext(snapshot));

    assert.deepEqual(results.map((result) => result.name), [
      'snapshot_integrity', 'template_identity', 'project_budgets', 'asset_policy',
      'block_policy', 'playability', 'public_metadata',
    ]);
    assert.equal(results.every((result) => result.status === 'passed'), true);
    assert.equal(results.every((result) => result.reasonCode === null), true);
    assert.equal(typeof isWorldReleaseReviewable, 'function');
    assert.equal(isWorldReleaseReviewable(results), true);
  });

  test('rejects a direct remote model URL with a fixed code only', async () => {
    const snapshot = validSnapshot();
    snapshot.scenes[0].objects[0].properties.model_url = 'https://untrusted.example/minion.fbx';

    const result = (await runWorldReleaseChecks(snapshot, validContext(snapshot)))
      .find((check) => check.name === 'asset_policy');

    assert.deepEqual(result, {
      name: 'asset_policy',
      status: 'failed',
      reasonCode: 'asset_url_invalid',
    });
    assert.equal(isWorldReleaseReviewable(await runWorldReleaseChecks(snapshot, validContext(snapshot))), false);
  });

  test('rejects locally flagged public metadata without returning its text', async () => {
    const snapshot = validSnapshot();
    snapshot.project.title = 'Nude Minion Steps';

    const result = (await runWorldReleaseChecks(snapshot, validContext(snapshot)))
      .find((check) => check.name === 'public_metadata');

    assert.deepEqual(result, {
      name: 'public_metadata',
      status: 'failed',
      reasonCode: 'metadata_moderation_failed',
    });
  });
}

module.exports = { validSnapshot, validContext, snapshotHash };
