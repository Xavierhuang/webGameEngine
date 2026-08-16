/**
 * The example games are validated against the real palette.
 *
 * This is the whole reason they are data rather than SQL. An example that
 * references a block which does not exist, or names an input the interpreter
 * never reads, would seed perfectly and then do nothing when a child pressed
 * Play — and these are the first complete games anyone sees.
 *
 * The hat-shape check is here because I got it wrong myself: a hat takes the
 * blocks that FOLLOW it, and writing one with nested `children` produces a
 * script the interpreter silently ignores.
 */

const assert = require('assert');
const {
  EXAMPLE_GAMES,
  exampleBlockTypes,
  exampleStarters,
} = require('../.build/lib/examples/catalog');
const { BLOCK_SPECS } = require('../.build/lib/blockly/definitions');
const { HAT_TYPES } = require('../.build/lib/runtime/interpreter');
const { CHARACTER_TEMPLATES } = require('../.build/lib/prefabs/characters');

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

test('there are enough examples to show a range', () => {
  assert.ok(EXAMPLE_GAMES.length >= 4, `only ${EXAMPLE_GAMES.length} examples`);
  const ids = EXAMPLE_GAMES.map((g) => g.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate example ids');
  for (const g of EXAMPLE_GAMES) {
    assert.ok(g.title && g.description && g.tagline, `${g.id} is missing copy`);
    assert.ok(g.objects.length > 0, `${g.id} has no objects`);
    assert.ok(g.teaches.length > 0, `${g.id} claims to teach nothing`);
  }
});

test('every block an example uses actually exists', () => {
  const missing = exampleBlockTypes().filter((t) => !(t in BLOCK_SPECS));
  assert.deepStrictEqual(missing, [], `examples reference blocks that do not exist:\n  ${missing.join('\n  ')}`);
});

test('every input an example sets is one the block declares', () => {
  // A misspelled input is invisible: the block runs with its default and the
  // example quietly does the wrong thing.
  const problems = [];
  const walk = (blocks, where) => {
    for (const b of blocks) {
      const spec = BLOCK_SPECS[b.block_type];
      if (spec) {
        const known = new Set([...spec.fields, ...spec.values]);
        for (const key of Object.keys(b.inputs ?? {})) {
          if (!known.has(key)) problems.push(`${where}: ${b.block_type}.${key}`);
        }
      }
      if (b.children) walk(b.children, where);
    }
  };
  for (const g of EXAMPLE_GAMES) for (const o of g.objects) walk(o.blocks, `${g.id}/${o.name}`);
  assert.deepStrictEqual(problems, [], `inputs no block declares:\n  ${problems.join('\n  ')}`);
});

test('hats take following blocks, never nested children', () => {
  // The shape that silently produces a script the interpreter ignores.
  const problems = [];
  for (const g of EXAMPLE_GAMES) {
    for (const o of g.objects) {
      for (const b of o.blocks) {
        if (HAT_TYPES.has(b.block_type) && b.children) {
          problems.push(`${g.id}/${o.name}: ${b.block_type} has children`);
        }
      }
    }
  }
  assert.deepStrictEqual(problems, [], problems.join('\n  '));
});

test('every object script starts with a hat', () => {
  // Blocks before the first hat belong to no script and never run.
  for (const g of EXAMPLE_GAMES) {
    for (const o of g.objects) {
      assert.ok(o.blocks.length > 0, `${g.id}/${o.name} has no blocks`);
      assert.ok(
        HAT_TYPES.has(o.blocks[0].block_type),
        `${g.id}/${o.name} starts with ${o.blocks[0].block_type}, which is not a hat`
      );
    }
  }
});

test('only C-blocks carry children', () => {
  const problems = [];
  const walk = (blocks, where) => {
    for (const b of blocks) {
      if (b.children) {
        const spec = BLOCK_SPECS[b.block_type];
        if (!spec || spec.statements.length === 0) {
          problems.push(`${where}: ${b.block_type} cannot hold blocks`);
        }
        walk(b.children, where);
      }
    }
  };
  for (const g of EXAMPLE_GAMES) for (const o of g.objects) walk(o.blocks, `${g.id}/${o.name}`);
  assert.deepStrictEqual(problems, [], problems.join('\n  '));
});

test('every starter an example uses is in the library', () => {
  const known = new Set(CHARACTER_TEMPLATES.map((c) => c.id));
  const missing = exampleStarters().filter((s) => !known.has(s));
  assert.deepStrictEqual(missing, [], `examples use characters that do not exist: ${missing.join(', ')}`);
});

test('an object referenced by name exists in its own game', () => {
  // `when touching Hero` in a game with no Hero never fires.
  const problems = [];
  for (const g of EXAMPLE_GAMES) {
    const names = new Set(g.objects.map((o) => o.name));
    const walk = (blocks, where) => {
      for (const b of blocks) {
        const target = b.inputs?.target;
        if (typeof target === 'string' && target && !names.has(target)) {
          problems.push(`${where}: refers to "${target}", which is not in this game`);
        }
        if (b.children) walk(b.children, where);
      }
    };
    for (const o of g.objects) walk(o.blocks, `${g.id}/${o.name}`);
  }
  assert.deepStrictEqual(problems, [], problems.join('\n  '));
});

test('the examples between them show off the range', () => {
  // The point of these is breadth: if every example used the same six blocks
  // they would not answer "what is possible".
  const used = new Set(exampleBlockTypes());
  for (const feature of ['burst_particles', 'start_particles', 'create_clone_of', 'ask_ai',
                         'speak', 'translate_to', 'pen_down', 'set_variable', 'when_touches',
                         'camera_follow', 'camera_shake']) {
    assert.ok(used.has(feature), `no example demonstrates ${feature}`);
  }
  assert.ok(used.size >= 25, `examples only use ${used.size} distinct blocks`);
});

console.log(`\nexample games: ${passed} checks passed`);
