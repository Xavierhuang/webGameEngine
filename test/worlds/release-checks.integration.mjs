import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runWorldReleaseChecks } = require('../.build/lib/worlds/releaseChecks.js');
const { getWorldTemplate } = require('../.build/lib/worlds/templates.js');
import { buildPassingWorldSnapshot, fixtureUuid } from '../helpers/world-release-fixture.mjs';
process.env.RELEASE_CHECK_FIXTURES_ONLY = '1';
const { validSnapshot, validContext, snapshotHash } = require('./release-checks.test.js');

function checkByName(results, name) {
  const result = results.find((candidate) => candidate.name === name);
  assert.ok(result, `expected fixed check ${name}`);
  return result;
}


test('accepts a snapshot materialized from the active current template catalog', async () => {
  const snapshot = buildPassingWorldSnapshot();
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

test('enforces clone and trusted persisted-asset byte budgets without using object limits', async () => {
  const cloneOverflow = validSnapshot();
  cloneOverflow.scenes[0].objects[0].logic_blocks.push(...Array.from({ length: 21 }, (_, index) => ({
    ...cloneOverflow.scenes[0].objects[0].logic_blocks[1],
    id: `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`,
    order_index: index + 2,
    block_type: 'create_clone_of',
    block_data: { inputs: { target: 'myself' } },
  })));
  assert.deepEqual(checkByName(await runWorldReleaseChecks(cloneOverflow, validContext(cloneOverflow)), 'project_budgets'), {
    name: 'project_budgets', status: 'failed', reasonCode: 'budget_exceeded',
  });

  const byteOverflow = validSnapshot();
  byteOverflow.assets.push({
    id: '88888888-8888-4888-8888-888888888888', asset_type: 'model', name: 'Upload',
    file_url: '/uploads/models/upload.glb', mime_type: 'model/gltf-binary', blob_checksum: null,
  });
  const byteOverflowContext = validContext(byteOverflow);
  byteOverflowContext.assetByteSizes['88888888-8888-4888-8888-888888888888'] = 17 * 1024 * 1024;
  assert.deepEqual(checkByName(await runWorldReleaseChecks(byteOverflow, byteOverflowContext), 'project_budgets'), {
    name: 'project_budgets', status: 'failed', reasonCode: 'budget_exceeded',
  });

  const unavailableSize = validSnapshot();
  unavailableSize.assets.push({
    id: '99999999-9999-4999-8999-999999999999', asset_type: 'sound', name: 'Sound',
    file_url: '/uploads/audio/recording.webm', mime_type: 'audio/webm', blob_checksum: null,
  });
  const unavailableSizeContext = validContext(unavailableSize);
  delete unavailableSizeContext.assetByteSizes['99999999-9999-4999-8999-999999999999'];
  assert.deepEqual(checkByName(await runWorldReleaseChecks(unavailableSize, unavailableSizeContext), 'project_budgets'), {
    name: 'project_budgets', status: 'failed', reasonCode: 'asset_size_unavailable',
  });
});

test('rejects invalid expressions, statement placement, and arbitrary serialized block data', async () => {
  const invalidExpression = validSnapshot();
  invalidExpression.scenes[0].objects[0].logic_blocks[1].block_data.inputs.distance = { op: 'unimplemented_operator', args: [] };
  assert.deepEqual(checkByName(await runWorldReleaseChecks(invalidExpression, validContext(invalidExpression)), 'block_policy'), {
    name: 'block_policy', status: 'failed', reasonCode: 'block_data_invalid',
  });

  const invalidPlacement = validSnapshot();
  invalidPlacement.scenes[0].objects[0].logic_blocks[1].block_data.children = [{ id: 'nested', block_type: 'jump', inputs: {} }];
  assert.deepEqual(checkByName(await runWorldReleaseChecks(invalidPlacement, validContext(invalidPlacement)), 'block_policy'), {
    name: 'block_policy', status: 'failed', reasonCode: 'block_data_invalid',
  });

  const arbitraryData = validSnapshot();
  arbitraryData.scenes[0].objects[0].logic_blocks[1].block_data.unvalidated = true;
  assert.deepEqual(checkByName(await runWorldReleaseChecks(arbitraryData, validContext(arbitraryData)), 'block_policy'), {
    name: 'block_policy', status: 'failed', reasonCode: 'block_data_invalid',
  });

  const nestedInjectedData = validSnapshot();
  nestedInjectedData.scenes[0].objects[0].logic_blocks[1] = {
    ...nestedInjectedData.scenes[0].objects[0].logic_blocks[1],
    block_type: 'if_then',
    block_data: {
      inputs: { condition: true },
      children: [{ block_type: 'jump', inputs: {}, injected: true }],
    },
  };
  assert.deepEqual(checkByName(await runWorldReleaseChecks(nestedInjectedData, validContext(nestedInjectedData)), 'block_policy'), {
    name: 'block_policy', status: 'failed', reasonCode: 'block_data_invalid',
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
