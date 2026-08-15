/**
 * Search over the starter pickers, tested against the real prefab list.
 *
 * The point of this search is that a child can find a character by the word
 * they would actually think of, so the tests are phrased that way.
 */

const assert = require('assert');
const { matchesStarter, filterStarters } = require('../.build/lib/editor/starterSearch');
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

const find = (q) => filterStarters(CHARACTER_TEMPLATES, q).map((c) => c.id);

test('an empty query leaves the curated grid untouched', () => {
  const all = filterStarters(CHARACTER_TEMPLATES, '');
  assert.strictEqual(all.length, CHARACTER_TEMPLATES.length);
  assert.deepStrictEqual(
    all.map((c) => c.id),
    CHARACTER_TEMPLATES.map((c) => c.id),
    'order is curated and must be preserved'
  );
  assert.deepStrictEqual(filterStarters(CHARACTER_TEMPLATES, '   ').length, CHARACTER_TEMPLATES.length);
});

test('a child finds a character by its name', () => {
  assert.ok(find('hero').includes('hero'));
  assert.ok(find('Knight').includes('knight'), 'search must be case-insensitive');
});

test('a child finds a character by a word they would actually think of', () => {
  // These come from each prefab's aliases, which until now only the AI used.
  assert.ok(find('good guy').includes('hero'), '"good guy" should find the Hero');
  assert.ok(find('player').includes('hero'));
});

test('partial words work, because children guess at spelling', () => {
  assert.ok(find('dino').includes('dinosaur'));
  assert.ok(find('uni').includes('unicorn'));
});

test('adding a word narrows the results, never widens them', () => {
  const one = find('space');
  const two = find('space explorer');
  assert.ok(two.length <= one.length, 'a second word must not add results');
  assert.ok(two.every((id) => one.includes(id)), 'narrowing must stay within the first result set');
});

test('punctuation and extra spacing do not defeat it', () => {
  assert.deepStrictEqual(find('  hero!!  '), find('hero'));
});

test('nonsense returns nothing rather than everything', () => {
  assert.deepStrictEqual(find('zzzzqqq'), [], 'a bad query must not fall back to the full list');
});

test('every starter is reachable by typing its own name', () => {
  // A character nobody can search for may as well not be in the library.
  const unreachable = CHARACTER_TEMPLATES.filter((c) => !matchesStarter(c, c.name));
  assert.deepStrictEqual(
    unreachable.map((c) => c.id),
    [],
    'these cannot be found by their own name'
  );
});

test('the whole library is searchable, not just the first screen', () => {
  assert.ok(CHARACTER_TEMPLATES.length >= 30, 'sanity: the catalogue loaded');
  const reachable = new Set();
  for (const c of CHARACTER_TEMPLATES) for (const id of find(c.name)) reachable.add(id);
  assert.strictEqual(
    reachable.size,
    CHARACTER_TEMPLATES.length,
    'some starters are unreachable by search'
  );
});

console.log(`\nstarter search: ${passed} checks passed`);
