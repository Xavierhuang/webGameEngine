'use strict';

const assert = require('node:assert/strict');

const { shouldRunBackgroundBeat } = require('../.build/lib/audio/backgroundBeatPolicy.js');

assert.equal(
  shouldRunBackgroundBeat({ hasAutoplayBeat: true, showStartSplash: false, outcomeState: 'playing' }),
  true,
  'background music runs during an active game after Start Game',
);
assert.equal(
  shouldRunBackgroundBeat({ hasAutoplayBeat: true, showStartSplash: false, outcomeState: 'won' }),
  false,
  'background music stops when the win screen appears so the success cue stays one-time',
);
assert.equal(
  shouldRunBackgroundBeat({ hasAutoplayBeat: true, showStartSplash: false, outcomeState: 'lost' }),
  false,
  'background music also stops when the game-over screen appears',
);
assert.equal(
  shouldRunBackgroundBeat({ hasAutoplayBeat: true, showStartSplash: true, outcomeState: 'playing' }),
  false,
  'background music waits for the Start Game action',
);

console.log('Background beat policy tests passed');
