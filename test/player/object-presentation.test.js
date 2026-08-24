const assert = require('node:assert/strict');

const { bubbleForVisibility } = require('../.build/lib/player/objectPresentation.js');

const bubble = { text: 'Star collected!', style: 'say', expiresAt: null };
assert.deepEqual(
  bubbleForVisibility(bubble, true),
  bubble,
  'showing an object keeps its active bubble',
);
assert.equal(
  bubbleForVisibility(bubble, false),
  null,
  'hiding an object clears its active bubble immediately',
);

console.log('Object presentation visibility tests passed');
