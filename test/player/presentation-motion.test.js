'use strict';

const assert = require('node:assert/strict');

const { proceduralMotion } = require('../.build/lib/player/presentationMotion.js');

const states = ['idle', 'walk', 'jump', 'fall'];
for (const state of states) {
  for (const time of [0, 0.125, 1.5, 19.75]) {
    const transform = proceduralMotion(state, time, false);
    assert.ok(Math.abs(transform.positionY) <= 0.08, `${state} position offset stays bounded`);
    assert.ok(Math.abs(transform.rotationZ) <= 0.12, `${state} rotation offset stays bounded`);
    assert.ok(transform.scaleY >= 0.94 && transform.scaleY <= 1.06, `${state} scale stays bounded`);
  }
}

for (const state of states) {
  assert.deepEqual(
    proceduralMotion(state, 2, true),
    { positionY: 0, rotationZ: 0, scaleY: 1 },
    `reduced motion disables ${state} decorative transforms`,
  );
}

const source = Object.freeze({ position: Object.freeze({ x: 4, y: 2, z: -1 }) });
const before = JSON.stringify(source);
proceduralMotion('walk', 0.8, false);
assert.equal(JSON.stringify(source), before, 'procedural motion does not mutate gameplay position');

console.log('Presentation motion tests passed');
