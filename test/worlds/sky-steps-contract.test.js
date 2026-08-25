'use strict';

const assert = require('node:assert/strict');

const { getWorldTemplate } = require('../.build/lib/worlds/templates');
const { validateSkyStepsFlagship } = require('../.build/lib/worlds/skyStepsContract');
const { movementRateForKey } = require('../.build/lib/runtime/interpreter');

function clone(template) {
  return JSON.parse(JSON.stringify(template));
}

function objectById(template, id) {
  return template.scenes[0].objects.find((object) => object.id === id);
}

const skySteps = getWorldTemplate('platformer', 2);
assert.ok(skySteps, 'Sky Steps v2 exists');
assert.deepEqual(validateSkyStepsFlagship(skySteps), []);
assert.equal(movementRateForKey(objectById(skySteps, 'sky-hero').blocks, 'ArrowRight'), 5, 'the contract measures the generated Hero movement rate');

const withUnreachableStep = clone(skySteps);
objectById(withUnreachableStep, 'sky-step-one').position[1] += 10;
assert.match(validateSkyStepsFlagship(withUnreachableStep).join('\n'), /reachable/);

const withUnforgivingFirstJump = clone(skySteps);
objectById(withUnforgivingFirstJump, 'sky-step-one').position[0] += 1;
assert.match(validateSkyStepsFlagship(withUnforgivingFirstJump).join('\n'), /forgiving first jump/);

const withSlowerHero = clone(skySteps);
objectById(withSlowerHero, 'sky-hero').blocks.find((block) => block.id === 'sky-hero-move-right').inputs.distance = 50;
assert.match(validateSkyStepsFlagship(withSlowerHero).join('\n'), /reachable/);

const withStarAboveSurface = clone(skySteps);
objectById(withStarAboveSurface, 'sky-star-one').position[1] += 10;
assert.match(validateSkyStepsFlagship(withStarAboveSurface).join('\n'), /reachable star/);

const withoutSpaceJump = clone(skySteps);
objectById(withoutSpaceJump, 'sky-hero').blocks = objectById(withoutSpaceJump, 'sky-hero').blocks
  .filter((block) => block.id !== 'sky-hero-space' && block.id !== 'sky-hero-jump');
assert.match(validateSkyStepsFlagship(withoutSpaceJump).join('\n'), /SPACE jump/);

const withoutPortalTouchWin = clone(skySteps);
objectById(withoutPortalTouchWin, 'sky-portal').blocks = [
  { id: 'sky-portal-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
];
assert.match(validateSkyStepsFlagship(withoutPortalTouchWin).join('\n'), /portal win/);

const withRenameMission = clone(skySteps);
withRenameMission.missions.find((mission) => mission.id === 'sky-steps-add-platform').objectType = 'character';
assert.match(validateSkyStepsFlagship(withRenameMission).join('\n'), /post-baseline/);

console.log('Sky Steps contract tests passed');
