'use strict';

const assert = require('node:assert/strict');

const {
  LEGACY_GROUND_Y,
  platformTopSurface,
  findLandingSurface,
  toPlayerPosition,
  touchesSphere,
} = require('../.build/lib/player/platformerWorld.js');

assert.deepEqual(
  toPlayerPosition([2, 1, -3], { legacyGround: false }),
  { x: 2, y: 1, z: -3 },
);
assert.equal(
  toPlayerPosition([2, 7, -3], { legacyGround: true }).y,
  LEGACY_GROUND_Y,
);

const surface = platformTopSurface(
  { type: 'platform', position: [2, 1, 0], size: 2 },
  { legacyGround: false },
);
assert.ok(surface);
assert.equal(surface.topY, 1);
assert.equal(
  findLandingSurface({ x: 2, z: 0, radius: 0.35 }, 1.4, 0.8, [surface])?.id,
  surface.id,
);
assert.equal(
  findLandingSurface({ x: 9, z: 0, radius: 0.35 }, 1.4, 0.8, [surface]),
  null,
);
assert.equal(
  touchesSphere({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, 0.6),
  true,
);

const rectangularSize = platformTopSurface(
  { id: 'rect-size', type: 'platform', position: [0, 1, 0], size: { width: 4, height: 2 } },
  { legacyGround: false },
);
assert.deepEqual(
  rectangularSize && {
    minX: rectangularSize.minX,
    maxX: rectangularSize.maxX,
    minZ: rectangularSize.minZ,
    maxZ: rectangularSize.maxZ,
  },
  { minX: -2, maxX: 2, minZ: -1, maxZ: 1 },
);
assert.equal(
  findLandingSurface({ x: 0, z: 1.25, radius: 0.1 }, 1.4, 0.8, rectangularSize ? [rectangularSize] : []),
  null,
  'size.height is the platform depth, so empty space beyond it cannot land',
);

const rectangularScale = platformTopSurface(
  { id: 'rect-scale', type: 'platform', position: [0, 2, 0], scale: [4, 2, 1] },
  { legacyGround: false },
);
assert.deepEqual(
  rectangularScale && {
    minX: rectangularScale.minX,
    maxX: rectangularScale.maxX,
    minZ: rectangularScale.minZ,
    maxZ: rectangularScale.maxZ,
  },
  { minX: -2, maxX: 2, minZ: -1, maxZ: 1 },
);
assert.equal(
  findLandingSurface({ x: 0, z: 0.75, radius: 0.1 }, 2.4, 1.8, rectangularScale ? [rectangularScale] : [])?.id,
  'rect-scale',
  'renderer scaleY is the platform depth, not scale[2]',
);

const legacySurface = platformTopSurface(
  { id: 'legacy', type: 'platform', position: [0, 7, 0], size: 2 },
  { legacyGround: true },
);
assert.equal(legacySurface?.topY, LEGACY_GROUND_Y);
assert.equal(
  platformTopSurface({ type: 'collectible', position: [0, 1, 0], shape: 'sphere', size: 2 }, { legacyGround: false }),
  null,
);

assert.equal(
  findLandingSurface({ x: 2.35, z: 0, radius: 0.35 }, 1.4, 0.8, [surface])?.id,
  surface.id,
  'horizontal footprint edges overlap inclusively',
);
assert.equal(findLandingSurface({ x: 2, z: 0, radius: 0.35 }, 0.8, 1.4, [surface]), null);
assert.equal(findLandingSurface({ x: 2, z: 0, radius: 0.35 }, 0.8, 0.4, [surface]), null);

const lowerSurface = { id: 'lower', minX: -2, maxX: 2, minZ: -2, maxZ: 2, topY: 0.5 };
const higherSurface = { id: 'higher', minX: -2, maxX: 2, minZ: -2, maxZ: 2, topY: 1.2 };
assert.equal(
  findLandingSurface({ x: 0, z: 0, radius: 0.2 }, 2, 0, [lowerSurface, higherSurface])?.id,
  'higher',
  'the highest crossed surface wins',
);

const defaultRendererPlatform = platformTopSurface(
  { id: 'default-renderer', type: 'platform', position: [0, -1, 0], properties: {} },
  { legacyGround: false },
);
assert.deepEqual(
  defaultRendererPlatform && {
    minX: defaultRendererPlatform.minX,
    maxX: defaultRendererPlatform.maxX,
    minZ: defaultRendererPlatform.minZ,
    maxZ: defaultRendererPlatform.maxZ,
  },
  { minX: -5, maxX: 5, minZ: -0.25, maxZ: 0.25 },
  'platform defaults match the renderer 1000x50px plane',
);

const widePersistedPlatform = platformTopSurface(
  {
    id: 'wide-persisted',
    type: 'platform',
    position: [0, 0, 0],
    properties: { size: { width: 2000, height: 50 } },
  },
  { legacyGround: false },
);
assert.deepEqual(
  widePersistedPlatform && {
    minX: widePersistedPlatform.minX,
    maxX: widePersistedPlatform.maxX,
    minZ: widePersistedPlatform.minZ,
    maxZ: widePersistedPlatform.maxZ,
  },
  { minX: -10, maxX: 10, minZ: -0.25, maxZ: 0.25 },
  'persisted platform pixels normalize by the renderer scale of 100',
);

const rendererScalePlatform = platformTopSurface(
  { id: 'renderer-scale', type: 'platform', position: [0, 0, 0], scale: [10, 0.5, 1] },
  { legacyGround: false },
);
assert.deepEqual(
  rendererScalePlatform && {
    minX: rendererScalePlatform.minX,
    maxX: rendererScalePlatform.maxX,
    minZ: rendererScalePlatform.minZ,
    maxZ: rendererScalePlatform.maxZ,
  },
  { minX: -5, maxX: 5, minZ: -0.25, maxZ: 0.25 },
  'renderer scale uses scaleX/scaleY as world X/Z dimensions',
);

console.log('Platformer world tests passed');
