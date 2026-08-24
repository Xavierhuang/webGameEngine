'use strict';

const assert = require('node:assert/strict');

const { getWorldTemplate } = require('../.build/lib/worlds/templates');
const { validateWorldTemplate } = require('../.build/lib/worlds/templateValidation');

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
  hero.blocks.slice(-2).map((block) => ({ id: block.id, block_type: block.block_type, inputs: block.inputs })),
  [
    { id: 'sky-hero-space', block_type: 'on_key_press', inputs: { key: 'SPACE' } },
    { id: 'sky-hero-jump', block_type: 'jump', inputs: undefined },
  ],
  'Hero can jump with Space',
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
  assert.equal(blocks.some((block) => block.block_type === 'you_win'), false, `${star.name} does not end the game`);
}

const portal = objects.find((object) => object.name === 'Sky Portal');
assert.ok(portal, 'Sky Steps has a finish portal');
assert.deepEqual(portal.blocks, [
  { id: 'sky-portal-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
  { id: 'sky-portal-win', block_type: 'you_win', inputs: { message: 'You climbed every Sky Step!' } },
], 'only the portal completes Sky Steps');

assert.deepEqual(v2.missions, [
  { id: 'sky-steps-add-platform', title: 'Build a new step', description: 'Add a new platform after the starting steps.', kind: 'object_present', objectId: 'sky-extra-platform' },
  { id: 'sky-steps-add-star', title: 'Add a sky star', description: 'Add a new collectible after the starting stars.', kind: 'object_present', objectId: 'sky-extra-star' },
  { id: 'sky-steps-play', title: 'Play Sky Steps', description: 'Press Play and try the new steps.', kind: 'play_started' },
]);

assert.deepEqual(validateWorldTemplate(v2), []);

console.log('Sky Steps template tests passed');
