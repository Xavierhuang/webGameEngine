'use strict';

const assert = require('node:assert/strict');

const {
  JUMP_FORCE,
  advancePlatformerMotion,
  requestPlatformerJump,
} = require('../.build/lib/player/platformerMotion.js');

const raised = {
  id: 'raised',
  minX: -2,
  maxX: 2,
  minZ: -2,
  maxZ: 2,
  topY: 1,
};

const falling = {
  position: { x: 0, y: 1.1, z: 0 },
  velocity: { x: 0, y: -1, z: 0 },
  radius: 0.35,
  grounded: false,
};

const result = advancePlatformerMotion(falling, 0.1, [raised]);
assert.equal(result.groundedSurfaceId, 'raised', 'a descending character snaps to the crossed raised top');
assert.equal(result.position.y, 1);
assert.equal(result.velocity.y, 0);
assert.equal(requestPlatformerJump(result).velocity.y, JUMP_FORCE, 'a grounded character may jump');
assert.equal(
  requestPlatformerJump({ ...result, grounded: false }).velocity.y,
  result.velocity.y,
  'an airborne character cannot double jump',
);

const fallingPastMiss = {
  ...falling,
  position: { x: 4, y: 1.1, z: 0 },
};
assert.equal(
  advancePlatformerMotion(fallingPastMiss, 0.1, [raised]).position.y < 1,
  true,
  'a character outside the platform footprint keeps falling',
);

const legacyGround = advancePlatformerMotion(
  {
    position: { x: 0, y: -1.95, z: 0 },
    velocity: { x: 0, y: -1, z: 0 },
    radius: 0.35,
    grounded: false,
  },
  0.1,
  [],
);
assert.equal(legacyGround.position.y, -2, 'without raised surfaces, legacy fixed ground remains the fallback');
assert.equal(legacyGround.grounded, true);

assert.equal(
  advancePlatformerMotion(
    {
      ...result,
      position: { x: 4, y: 1, z: 0 },
    },
    0.1,
    [raised],
  ).position.y < 1,
  true,
  'walking beyond a raised platform edge resumes falling',
);

console.log('Platformer motion tests passed');
