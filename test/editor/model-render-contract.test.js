const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
  createModelRenderContract,
  resolveActiveModelMetadata,
} = require('../.build/lib/models/modelRenderContract.js');
const {
  matchCharacterPrefab,
} = require('../.build/lib/prefabs/characters.js');
const {
  buildCharacterVisual,
} = require('../.build/lib/prefabs/characterPayload.js');

const expectedBounds = {
  min: { x: -2.982, y: -1.836, z: -1.983 },
  max: { x: 2.82, y: 2.362, z: 1.983 },
};
const expectedOriginOffset = { x: 0, y: 1.836, z: 0 };

function readRoundedPositionAccessorBounds(assetPath) {
  const file = fs.readFileSync(assetPath);
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength).trim());
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];

  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    const accessor = json.accessors[primitive.attributes.POSITION];
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], accessor.min[axis]);
      maximum[axis] = Math.max(maximum[axis], accessor.max[axis]);
    }
  }

  const rounded = (value) => Math.round(value * 1000) / 1000;
  return {
    min: { x: rounded(minimum[0]), y: rounded(minimum[1]), z: rounded(minimum[2]) },
    max: { x: rounded(maximum[0]), y: rounded(maximum[1]), z: rounded(maximum[2]) },
  };
}

test('dragon metadata stays synchronized with current GLB position accessor bounds', () => {
  const dragon = matchCharacterPrefab('dragon');

  assert.deepEqual(
    dragon.model_bounds,
    readRoundedPositionAccessorBounds('public/models/red-metal-dragon.glb')
  );
});

test('dragon insertion payload propagates generic model bounds and origin metadata', () => {
  const dragon = matchCharacterPrefab('dragon');
  const visual = buildCharacterVisual(dragon);

  assert.deepEqual(visual.spriteData.model_bounds, expectedBounds);
  assert.deepEqual(visual.properties.model_bounds, expectedBounds);
  assert.deepEqual(visual.spriteData.model_origin_offset, expectedOriginOffset);
  assert.deepEqual(visual.properties.model_origin_offset, expectedOriginOffset);
});

test('shared editor/player contract assigns scale once and computes equal visible width', () => {
  const editor = createModelRenderContract(0.28, expectedBounds, expectedOriginOffset);
  const player = createModelRenderContract(0.28, expectedBounds, expectedOriginOffset);

  assert.deepEqual(editor.outerScale, [0.28, 0.28, 0.28]);
  assert.deepEqual(editor.innerScale, [1, 1, 1]);
  assert.deepEqual(editor.innerPosition, [0, 1.836, 0]);
  assert.equal(editor.visibleWidth, 1.62456);
  assert.equal(player.visibleWidth, 1.62456);
  assert.equal(editor.visibleWidth, player.visibleWidth);
});

test('model origin offset puts the scaled local minimum on its world anchor', () => {
  const contract = createModelRenderContract(0.28, expectedBounds, expectedOriginOffset);

  assert.equal(contract.scaledMinimumY, 0);
});

test('touch radius uses scaled horizontal half-extents with an import fallback', () => {
  const dragon = createModelRenderContract(0.28, expectedBounds, expectedOriginOffset);
  const importedModel = createModelRenderContract(0.28);

  assert.equal(dragon.touchRadius, 0.81228);
  assert.equal(importedModel.touchRadius, 0.14);
});

test('costume appearances only inherit bounds from the model they actually render', () => {
  const baseAppearance = resolveActiveModelMetadata({
    shape: 'model',
    baseModelUrl: '/models/red-metal-dragon.glb',
    modelUrl: '/models/red-metal-dragon.glb',
    baseBounds: expectedBounds,
    baseOriginOffset: expectedOriginOffset,
  });
  assert.deepEqual(baseAppearance, {
    bounds: expectedBounds,
    originOffset: expectedOriginOffset,
  });

  const importedCostume = resolveActiveModelMetadata({
    shape: 'model',
    baseModelUrl: '/models/red-metal-dragon.glb',
    modelUrl: '/uploads/alternate.glb',
    baseBounds: expectedBounds,
    baseOriginOffset: expectedOriginOffset,
  });
  const importedRender = createModelRenderContract(
    0.28,
    importedCostume.bounds,
    importedCostume.originOffset
  );
  assert.deepEqual(importedRender.innerPosition, [0, 0, 0]);
  assert.equal(importedRender.touchRadius, 0.14);

  const primitiveCostume = resolveActiveModelMetadata({
    shape: 'box',
    baseModelUrl: '/models/red-metal-dragon.glb',
    modelUrl: '/models/red-metal-dragon.glb',
    baseBounds: expectedBounds,
    baseOriginOffset: expectedOriginOffset,
  });
  const primitiveRender = createModelRenderContract(
    0.28,
    primitiveCostume.bounds,
    primitiveCostume.originOffset
  );
  assert.deepEqual(primitiveRender.innerPosition, [0, 0, 0]);
  assert.equal(primitiveRender.touchRadius, 0.14);
});
