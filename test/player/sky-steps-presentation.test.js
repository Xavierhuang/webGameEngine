'use strict';

const assert = require('node:assert/strict');

const { deriveSkyStepsPresentation } = require('../.build/lib/player/skyStepsPresentation.js');

const visibleObjects = [
  { id: 'sky-star-three', name: 'Sky Star Three', type: 'collectible' },
  { id: 'sky-portal', name: 'Sky Portal', type: 'portal' },
];

const incomplete = deriveSkyStepsPresentation(visibleObjects, { state: 'playing', message: '' });
assert.equal(incomplete.totalStars, 3, 'Sky Steps has three named stars');
assert.equal(incomplete.collectedStars, 2, 'only hidden stars count as collected');
assert.equal(incomplete.starsLabel, 'Stars 2/3');
assert.equal(incomplete.goal, 'portal', 'the portal remains the goal while incomplete');
assert.match(incomplete.childReadableStatus, /Stars 2\/3/);
assert.match(incomplete.childReadableStatus, /Sky Portal/);
assert.doesNotMatch(incomplete.childReadableStatus, /sky-star-three|sky-portal/);

const hiddenStars = deriveSkyStepsPresentation([
  { id: 'sky-star-one', name: 'Sky Star One', type: 'collectible', hidden: true },
  { id: 'sky-star-two', name: 'Sky Star Two', type: 'collectible', visible: false },
  { id: 'sky-star-three', name: 'Sky Star Three', type: 'collectible', visible: true },
], { state: 'playing', message: '' });
assert.equal(hiddenStars.collectedStars, 2, 'explicitly hidden stars count as collected');

const won = deriveSkyStepsPresentation(visibleObjects, {
  state: 'won',
  message: 'You climbed every Sky Step!',
});
assert.equal(won.goal, 'win');
assert.equal(won.status, 'won');
assert.equal(won.childReadableStatus, 'You climbed every Sky Step!');

console.log('Sky Steps presentation tests passed');
