/**
 * Every block a child can drag must actually do something.
 *
 * This is the single most important invariant in the block language, and it
 * was checked once by hand in the original audit and never since — while the
 * palette grew from 107 blocks to 128. The failure is silent in the worst way:
 * the block appears in the toolbox, drags, snaps, saves, reloads, and does
 * nothing when the game runs. No error, no warning. A child assumes they used
 * it wrong.
 *
 * The three dispatch paths are deliberately checked separately, because a
 * block landing in the wrong one is itself the bug:
 *
 *  - hats     — started by the runtime (broadcast, key, click), never executed
 *               as a statement, so they have no `case` and must not have one
 *  - statements — a `case` in runBlock
 *  - expressions — either a pure function in the operators record, or a
 *               context-dependent lookup in the interpreter (touching, timer,
 *               mouse position: things a pure function cannot answer)
 */

const fs = require('fs');
const assert = require('assert');
const { BLOCK_SPECS } = require('../.build/lib/blockly/definitions');
const { HAT_TYPES } = require('../.build/lib/runtime/interpreter');

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

const interpreter = fs.readFileSync('lib/runtime/interpreter.ts', 'utf8');
const operatorSource = fs.readFileSync('lib/runtime/operators.ts', 'utf8');

/** Names in the `operators` record: two-space indented `name: (` entries. */
const operatorNames = new Set(
  [...operatorSource.matchAll(/^\s{2}([a-z_0-9]+):\s*\(/gm)].map((m) => m[1])
);

const allTypes = Object.keys(BLOCK_SPECS);
const statements = allTypes.filter((t) => !t.startsWith('expr_') && !HAT_TYPES.has(t));
const hats = allTypes.filter((t) => HAT_TYPES.has(t));
const expressions = allTypes.filter((t) => t.startsWith('expr_')).map((t) => t.slice(5));

/**
 * Cases inside `runBlock` only.
 *
 * The interpreter has two switches: `shouldStart` decides whether a hat fires,
 * and `runBlock` executes statements. Both use `case 'on_start'`-shaped labels,
 * so searching the whole file cannot tell a hat from a statement — my first
 * version of this test reported all six hats as bugs because of that.
 */
const runBlockBody = (() => {
  const start = interpreter.indexOf('private *runBlock(');
  assert.ok(start > 0, 'runBlock not found — has the interpreter been restructured?');
  return interpreter.slice(start);
})();
const hasCase = (type) => new RegExp(`case\\s+['"]${type}['"]`).test(runBlockBody);
const namedInInterpreter = (name) => new RegExp(`['"]${name}['"]`).test(interpreter);

test('the palette is big enough that this check is meaningful', () => {
  assert.ok(allTypes.length > 120, `only ${allTypes.length} blocks found — did the registry load?`);
  assert.ok(hats.length >= 6, `only ${hats.length} hats found`);
  assert.ok(expressions.length > 50, `only ${expressions.length} expressions found`);
});

test('every statement block has an interpreter case', () => {
  const orphans = statements.filter((t) => !hasCase(t));
  assert.deepStrictEqual(
    orphans,
    [],
    `these blocks are in the palette but do nothing when run:\n  ${orphans.join('\n  ')}`
  );
});

test('every hat block is known to the runtime', () => {
  // Hats are started by the runtime, so the check is that the runtime knows
  // them — not that they have a case, which they must not.
  const unknown = hats.filter((t) => !namedInInterpreter(t));
  assert.deepStrictEqual(unknown, [], `hats the runtime never starts:\n  ${unknown.join('\n  ')}`);
});

test('every expression resolves to a pure operator or a runtime lookup', () => {
  const orphans = expressions.filter((op) => !operatorNames.has(op) && !namedInInterpreter(op));
  assert.deepStrictEqual(
    orphans,
    [],
    `these expressions evaluate to nothing:\n  ${orphans.join('\n  ')}`
  );
});

test('no hat is also executable as an ordinary statement', () => {
  // A hat with a case in runBlock would run twice: once when its event fires,
  // and again if anything executed it as a normal block.
  const both = hats.filter((t) => hasCase(t));
  assert.deepStrictEqual(both, [], `blocks dispatched two ways:\n  ${both.join('\n  ')}`);
});

test('the toolbox only offers blocks that exist', () => {
  // A toolbox entry for an undefined type renders an empty grey block a child
  // can drag but never connect.
  const { TOOLBOX } = require('../.build/lib/blockly/definitions');
  const offered = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    if (n.kind === 'block' && typeof n.type === 'string') offered.push(n.type);
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };
  walk(TOOLBOX);
  assert.ok(offered.length > 100, `only ${offered.length} toolbox entries found`);
  const undefinedTypes = [...new Set(offered)].filter(
    (t) => !(t in BLOCK_SPECS) && !t.startsWith('procedures_')
  );
  assert.deepStrictEqual(
    undefinedTypes,
    [],
    `the toolbox offers blocks with no definition:\n  ${undefinedTypes.join('\n  ')}`
  );
});

console.log(`\npalette coverage: ${passed} checks passed`);
