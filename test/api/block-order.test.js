/**
 * Every read of logic_blocks must be ordered.
 *
 * A script is a flat, ordered array: a hat block owns the blocks that *follow*
 * it, so row order is the program. Three of the seven read sites — the player,
 * the editor's initial load, and the editor's refresh — had no ORDER BY, so
 * MySQL returned rows in roughly primary-key order, which for a UUID key is
 * arbitrary. Every published game and every project opened in the editor ran a
 * shuffled version of its own script.
 *
 * It produced no error anywhere. The Talking Robot example simply skipped its
 * first question, which reads as a quirky game rather than a database bug.
 *
 * Source-level because it is a SQL string, not behaviour any pure test can
 * reach. Deliberately blunt: any new read of this table has to order too.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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

/** Every .ts/.tsx under app/ and lib/, which is where queries live. */
function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = [...sourceFiles('app'), ...sourceFiles('lib')];

/**
 * A SELECT from logic_blocks, with whatever follows it up to the closing
 * backtick — enough to see whether an ORDER BY belongs to this statement.
 */
const SELECTS = /SELECT[\s\S]{0,400}?FROM logic_blocks[\s\S]{0,400}?`/g;

test('every logic_blocks SELECT orders by order_index', () => {
  const unordered = [];
  let found = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.match(SELECTS) ?? []) {
      // Aggregates and existence checks carry no script order.
      if (/COUNT\(|SELECT\s+1\b/i.test(match)) continue;
      found++;
      if (!/ORDER BY[^`]*order_index/i.test(match)) {
        unordered.push(`${file}: ${match.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
  }

  assert.ok(found >= 5, `expected to find the known logic_blocks reads, found ${found}`);
  assert.deepStrictEqual(
    unordered,
    [],
    'these read a script without ordering it, so the blocks come back shuffled:\n  ' +
      unordered.join('\n  ')
  );
});

console.log(`\nblock order: ${passed} check passed`);
