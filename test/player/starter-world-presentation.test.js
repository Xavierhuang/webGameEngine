'use strict';

const assert = require('node:assert/strict');

const { deriveStarterWorldPresentation } = require('../.build/lib/player/starterWorldPresentation');

const expected = [
  ['obby', 1, 'Rainbow Obby', 'Collect rainbow gems, steer around bumpers, and reach the finish star.'],
  ['racing', 1, 'Turbo Track', 'Grab turbo stars, avoid cones, and cross the finish flag.'],
  ['story', 1, 'Castle Story', 'Click the wizard, find royal stars, and open the treasure.'],
  ['pet', 1, 'Happy Pet Park', 'Meet your park pal, find treats, and fetch the sparkling ball.'],
];

for (const [templateId, templateVersion, title, goal] of expected) {
  assert.deepEqual(
    deriveStarterWorldPresentation({ templateId, templateVersion }),
    { title, eyebrow: 'Your quest', goal },
    `${title} gives a child one clear in-stage quest`,
  );
}

assert.equal(deriveStarterWorldPresentation({ templateId: 'platformer', templateVersion: 2 }), null,
  'Sky Steps keeps its dedicated stars-and-portal HUD');
assert.equal(deriveStarterWorldPresentation({ templateId: 'unknown', templateVersion: 1 }), null,
  'non-starter worlds do not receive a misleading quest card');
assert.equal(deriveStarterWorldPresentation(undefined), null,
  'hand-built worlds keep their own instructions');

console.log('Starter world presentation tests passed');
