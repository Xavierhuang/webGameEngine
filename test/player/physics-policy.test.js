'use strict';

const assert = require('node:assert/strict');

const { requiresDynamicPhysics } = require('../.build/lib/player/physicsPolicy.js');

// Regression: persisted logic rows label every hat as `event`. A collectible
// only needs its `when_touches` hat to run, not gravity. Treating all events
// as movement makes a Sky Steps star drop through the level.
const savedSkyStar = [
  { block_type: 'when_touches', category: 'event' },
  { block_type: 'play_sound', category: 'sound' },
  { block_type: 'hide', category: 'looks' },
];
assert.equal(
  requiresDynamicPhysics(savedSkyStar),
  false,
  'a saved touch-only collectible stays at its authored floating position',
);

assert.equal(
  requiresDynamicPhysics([{ block_type: 'on_key_press', category: 'event' }]),
  true,
  'keyboard-controlled objects still receive gravity and collision physics',
);
assert.equal(
  requiresDynamicPhysics([{ block_type: 'jump', category: 'action' }]),
  true,
  'a scripted jump receives the vertical physics it needs',
);
assert.equal(
  requiresDynamicPhysics([{ block_type: 'move', category: 'action' }]),
  true,
  'movement actions retain their existing physics behavior',
);

console.log('Player physics policy tests passed');
