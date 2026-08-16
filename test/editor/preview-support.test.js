/**
 * What the Logic preview claims it can show.
 *
 * Reported as "where should I see the smoke?" — a fair question about a button
 * labelled Preview that ran the blocks and showed nothing. The preview's
 * context stubs out every visual method, so particles, movement, the pen and
 * the camera all execute perfectly into a void.
 *
 * The important property is coverage: every block in the palette must be
 * classified, so a new block cannot quietly default to a wrong answer.
 */

const assert = require('assert');
const {
  previewCapability,
  classifiedBlocks,
  summarisePreview,
  previewNotice,
} = require('../.build/lib/editor/previewSupport');
const { BLOCK_SPECS } = require('../.build/lib/blockly/definitions');

let passed = 0;
function test(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    process.exit(1);
  }
  passed++;
  console.log(`ok   ${name}`);
}

const statements = Object.keys(BLOCK_SPECS).filter((t) => !t.startsWith('expr_'));

test('every block in the palette is classified', () => {
  // The guard that matters: a new block must be placed deliberately.
  const known = new Set(classifiedBlocks());
  const unclassified = statements.filter((t) => !known.has(t));
  assert.deepStrictEqual(
    unclassified,
    [],
    `these blocks have no preview classification:\n  ${unclassified.join('\n  ')}`
  );
});

test('the classification does not invent blocks', () => {
  const real = new Set(statements);
  const ghosts = classifiedBlocks().filter((t) => !real.has(t));
  assert.deepStrictEqual(ghosts, [], `classified blocks that do not exist: ${ghosts.join(', ')}`);
});

test('sound blocks are the ones the preview really plays', () => {
  assert.strictEqual(previewCapability('play_sound'), 'audible');
  assert.strictEqual(previewCapability('play_note'), 'audible');
  assert.strictEqual(previewCapability('speak'), 'audible');
});

test('everything visual is honest about needing Play', () => {
  for (const block of ['move', 'jump', 'say', 'burst_particles', 'start_particles',
                       'camera_shake', 'camera_follow', 'pen_down', 'show', 'create_clone_of']) {
    assert.strictEqual(previewCapability(block), 'needs-scene', `${block} claims the preview can show it`);
  }
});

test('control flow is not warned about, since there is nothing to see anyway', () => {
  for (const block of ['forever', 'repeat', 'wait', 'set_variable', 'broadcast', 'if_then']) {
    assert.strictEqual(previewCapability(block), 'invisible', `${block} would produce a pointless warning`);
  }
});

test('an unknown block errs toward telling the child to press Play', () => {
  // Better a redundant nudge than a silent nothing.
  assert.strictEqual(previewCapability('some_future_block'), 'needs-scene');
});

test('the summary walks into loops', () => {
  // A burst inside a forever is the common case and must not be missed.
  const summary = summarisePreview([
    { block_type: 'on_start' },
    { block_type: 'forever', children: [{ block_type: 'burst_particles' }] },
  ]);
  assert.deepStrictEqual(summary.needsPlay, ['particles']);
});

test('the notice names what is actually in the script', () => {
  const smoke = summarisePreview([
    { block_type: 'on_start' },
    { block_type: 'burst_particles' },
  ]);
  assert.strictEqual(previewNotice(smoke), 'To see particles, press Play.');

  const both = summarisePreview([
    { block_type: 'on_start' },
    { block_type: 'play_sound' },
    { block_type: 'move' },
    { block_type: 'camera_shake' },
  ]);
  assert.strictEqual(previewNotice(both), 'Sounds play here. To see movement and the camera, press Play.');
});

test('a script the preview can fully show says nothing', () => {
  // No warning on a pure sound script — a notice that always appears is noise.
  const sound = summarisePreview([
    { block_type: 'on_start' },
    { block_type: 'play_sound' },
    { block_type: 'wait' },
    { block_type: 'play_drum' },
  ]);
  assert.strictEqual(previewNotice(sound), null);
  assert.strictEqual(previewNotice(summarisePreview([])), null);
});

test('duplicates are collapsed', () => {
  const summary = summarisePreview([
    { block_type: 'on_start' },
    { block_type: 'move' }, { block_type: 'jump' }, { block_type: 'goto_xyz' },
  ]);
  assert.deepStrictEqual(summary.needsPlay, ['movement'], 'three motion blocks should read as one group');
});

test('malformed scripts do not throw', () => {
  // This runs on every preview press, against whatever is on the canvas.
  assert.doesNotThrow(() => summarisePreview(null));
  assert.doesNotThrow(() => summarisePreview([null, undefined, {}, { block_type: 5 }]));
  assert.doesNotThrow(() => summarisePreview([{ block_type: 'forever', children: 'nope' }]));
});

console.log(`\npreview support: ${passed} checks passed`);
