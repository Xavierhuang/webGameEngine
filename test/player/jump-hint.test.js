const assert = require('node:assert/strict');

const { hasSpaceJumpScript } = require('../.build/lib/player/jumpHint.js');

assert.equal(
  hasSpaceJumpScript([
    { block_type: 'on_key_press', block_data: { inputs: { key: 'SPACE' } } },
    { block_type: 'jump', block_data: { inputs: {} } },
  ]),
  true,
  'a Space key hat immediately followed by jump enables the jump hint',
);

assert.equal(
  hasSpaceJumpScript([
    { block_type: 'on_key_press', block_data: { inputs: { key: 'SPACE' } } },
    { block_type: 'move', block_data: { inputs: { direction: 'right', distance: 100 } } },
    { block_type: 'jump', block_data: { inputs: {} } },
  ]),
  false,
  'a Space key script without an immediate jump does not promise a jump control',
);

assert.equal(
  hasSpaceJumpScript([
    { block_type: 'on_key_press', block_data: { inputs: { key: 'ArrowUp' } } },
    { block_type: 'jump', block_data: { inputs: {} } },
  ]),
  false,
  'non-Space jump scripts do not enable the Space hint',
);

console.log('Space jump hint contract passed');
