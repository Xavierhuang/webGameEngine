'use strict';

const assert = require('node:assert/strict');

const { getWorldTemplate } = require('../.build/lib/worlds/templates');
const { validateWorldTemplate } = require('../.build/lib/worlds/templateValidation');
const { GRAVITY, JUMP_FORCE } = require('../.build/lib/player/platformerMotion');
const { platformTopSurface, toPlayerPosition, touchesSphere } = require('../.build/lib/player/platformerWorld');
const { createModelRenderContract } = require('../.build/lib/models/modelRenderContract');
const { movementRateForKey } = require('../.build/lib/runtime/interpreter');

function walkBlocks(blocks, visitor) {
  for (const block of blocks) {
    visitor(block);
    walkBlocks(block.children || [], visitor);
    walkBlocks(block.elseChildren || [], visitor);
  }
}

const v1 = getWorldTemplate('platformer', 1);
const v2 = getWorldTemplate('platformer', 2);

assert.ok(v1);
assert.ok(v2);
assert.equal(v1.version, 1);
assert.equal(v2.version, 2);
assert.notDeepEqual(v2, v1);
assert.equal(v2.active, true, 'Sky Steps v2 is the active catalog version');
assert.equal(v2.scenes.length, 1);

const scene = v2.scenes[0];
const objects = scene.objects;
assert.equal(objects.filter((object) => object.type === 'platform').length >= 4, true);
assert.equal(objects.filter((object) => object.type === 'collectible').length >= 3, true);
assert.equal(objects.some((object) => object.name === 'Sky Portal'), true);
assert.equal(objects.some((object) => object.name === 'Moving Cloud'), true);

const hero = objects.find((object) => object.name === 'Hero');
assert.ok(hero, 'Sky Steps has its playable Hero');
assert.deepEqual(
  hero.blocks.slice(-3).map((block) => ({ id: block.id, block_type: block.block_type, inputs: block.inputs })),
  [
    { id: 'sky-hero-space', block_type: 'on_key_press', inputs: { key: 'SPACE' } },
    { id: 'sky-hero-jump', block_type: 'jump', inputs: undefined },
    { id: 'sky-hero-jump-sound', block_type: 'play_sound', inputs: { sound: 'jump' } },
  ],
  'Hero jumps with an audible cue when Space is pressed',
);

const soundtrack = objects.find((object) => object.id === 'sky-music');
assert.deepEqual(
  soundtrack && { type: soundtrack.type, properties: soundtrack.properties },
  { type: 'sound', properties: { autoplay_beat: true, beat: 'chill', bpm: 90 } },
  'Sky Steps includes gentle background music that starts with the game',
);

const cloud = objects.find((object) => object.name === 'Moving Cloud');
assert.ok(cloud, 'Sky Steps has a moving cloud');
assert.deepEqual(cloud.blocks, [{
  id: 'sky-cloud-loop',
  block_type: 'forever',
  children: [{ id: 'sky-cloud-slide', block_type: 'move', inputs: { direction: 'left', distance: 1 } }],
}], 'the cloud is visibly animated');

const stars = objects.filter((object) => object.type === 'collectible' && object.name.startsWith('Sky Star'));
assert.equal(stars.length, 3, 'three stars are available to collect');
for (const star of stars) {
  const blocks = [];
  walkBlocks(star.blocks, (block) => blocks.push(block));
  assert.equal(blocks.some((block) => block.block_type === 'when_touches' && block.inputs?.target === 'Hero'), true, `${star.name} reacts to Hero`);
  assert.equal(blocks.some((block) => block.block_type === 'say' && block.inputs?.text === 'Star collected!'), true, `${star.name} gives collection feedback`);
  assert.equal(blocks.some((block) => block.block_type === 'play_sound' && block.inputs?.sound === 'pickup'), true, `${star.name} plays a collection chime`);
  assert.equal(blocks.some((block) => block.block_type === 'hide'), true, `${star.name} disappears after one collection`);
  assert.equal(blocks.some((block) => block.block_type === 'you_win'), false, `${star.name} does not end the game`);
}

const portal = objects.find((object) => object.name === 'Sky Portal');
assert.ok(portal, 'Sky Steps has a finish portal');
assert.deepEqual(portal.blocks, [
  { id: 'sky-portal-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
  { id: 'sky-portal-fanfare', block_type: 'play_sound', inputs: { sound: 'fanfare' } },
  { id: 'sky-portal-win', block_type: 'you_win', inputs: { message: 'You climbed every Sky Step!' } },
], 'the portal plays a victory fanfare before completing Sky Steps');

const routeIds = ['sky-start-island', 'sky-step-one', 'sky-step-two', 'sky-extra-platform'];
const route = routeIds.map((id) => {
  const surface = platformTopSurface(objects.find((object) => object.id === id), { legacyGround: false });
  assert.ok(surface, `${id} has a player-world top surface`);
  return surface;
});

function horizontalGap(left, right, radius) {
  const dx = Math.max(left.minX - (right.maxX + radius * 2), right.minX - (left.maxX + radius * 2), 0);
  const dz = Math.max(left.minZ - (right.maxZ + radius * 2), right.minZ - (left.maxZ + radius * 2), 0);
  return Math.hypot(dx, dz);
}

const touchRadius = createModelRenderContract(1).touchRadius;
const heroRunSpeed = movementRateForKey(hero.blocks, 'ArrowRight');
assert.equal(heroRunSpeed, 5, 'Sky Steps uses the generated Hero movement rate used by the runtime');
assert.ok(
  route[1].minX - route[0].maxX <= 2,
  'the first step leaves a forgiving two-unit jump gap for new players',
);
for (let index = 1; index < route.length; index += 1) {
  const from = route[index - 1];
  const to = route[index];
  const height = to.topY - from.topY;
  const apex = (JUMP_FORCE ** 2) / (2 * GRAVITY);
  assert.ok(height <= apex, `${to.id} is below the measured jump apex`);
  const flightSeconds = (JUMP_FORCE + Math.sqrt(JUMP_FORCE ** 2 - 2 * GRAVITY * height)) / GRAVITY;
  assert.ok(horizontalGap(from, to, touchRadius) <= heroRunSpeed * flightSeconds, `${to.id} fits the generated Hero jump envelope`);
}

for (const target of [...stars, portal]) {
  const center = toPlayerPosition(target.position, { legacyGround: false });
  assert.ok(
    route.some((surface) => touchesSphere(center, {
      x: Math.min(surface.maxX, Math.max(surface.minX, center.x)),
      y: surface.topY,
      z: Math.min(surface.maxZ, Math.max(surface.minZ, center.z)),
    }, touchRadius)),
    `${target.name} is touchable from a reachable platform top`,
  );
}

assert.deepEqual(v2.missions, [
  { id: 'sky-steps-add-platform', title: 'Build a new step', description: 'Add a new platform after the starting steps.', kind: 'object_present', objectType: 'platform' },
  { id: 'sky-steps-add-star', title: 'Add a sky star', description: 'Add a new collectible after the starting stars.', kind: 'object_present', objectType: 'collectible' },
  { id: 'sky-steps-play', title: 'Play Sky Steps', description: 'Press Play and try the new steps.', kind: 'play_started' },
]);

assert.deepEqual(validateWorldTemplate(v2), []);

console.log('Sky Steps template tests passed');
