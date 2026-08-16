/**
 * The AI must know about every block the runtime can execute.
 *
 * The system prompt described the block language in hand-written prose, and it
 * had drifted: 34 of 83 statement blocks were missing, including all of Pen and
 * Music, text-to-speech, translate and ask-and-wait. A child asking for a
 * drawing game got an AI that did not know `pen_down` existed. Nothing failed
 * loudly — the AI simply built something else.
 *
 * This is the check that makes shipping a block sufficient to expose it.
 */

const assert = require('assert');
const { blockVocabulary, statementBlockTypes } = require('../.build/lib/ai/blockVocabulary');
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

test('the vocabulary covers every executable statement block', () => {
  const vocabulary = blockVocabulary();
  const missing = statementBlockTypes().filter(
    (type) => !new RegExp(`^- ${type}( |$)`, 'm').test(vocabulary)
  );
  assert.deepStrictEqual(missing, [], `the AI cannot use these blocks:\n  ${missing.join('\n  ')}`);
});

test('it covers the extensions that were missing entirely', () => {
  // Named explicitly: these are whole categories the prose had never mentioned,
  // and a regression here would silently remove a feature from the AI again.
  const vocabulary = blockVocabulary();
  for (const type of ['pen_down', 'pen_up', 'pen_clear', 'pen_set_color', 'pen_set_size',
                      'play_note', 'play_drum', 'set_tempo', 'set_instrument',
                      'speak', 'translate_to', 'ask_and_wait',
                      'switch_to_scene', 'set_effect', 'go_to_layer']) {
    assert.ok(new RegExp(`^- ${type}( |$)`, 'm').test(vocabulary), `${type} is missing`);
  }
});

test('every listed block names its real inputs', () => {
  // A block listed with the wrong input names is worse than one left out: the
  // AI emits confident JSON the interpreter cannot read.
  const vocabulary = blockVocabulary();
  for (const [type, spec] of Object.entries(BLOCK_SPECS)) {
    if (type.startsWith('expr_')) continue;
    const line = vocabulary.split('\n').find((l) => l.startsWith(`- ${type} `) || l === `- ${type}`);
    assert.ok(line, `${type} has no line`);
    for (const input of [...spec.fields, ...spec.values]) {
      assert.ok(line.includes(input), `${type} does not mention its input "${input}"`);
    }
  }
});

test('expression blocks are excluded, since they are not statements', () => {
  const vocabulary = blockVocabulary();
  assert.ok(!/^- expr_/m.test(vocabulary), 'expression blocks must not be listed as statements');
});

test('the list is deterministic, so the prompt does not churn', () => {
  assert.strictEqual(blockVocabulary(), blockVocabulary());
  const types = statementBlockTypes();
  assert.deepStrictEqual(types, [...types].sort(), 'output must be sorted');
});

console.log(`\nAI block vocabulary: ${passed} checks passed`);
