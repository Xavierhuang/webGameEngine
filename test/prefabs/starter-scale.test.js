/**
 * Every starter arrives in the scene at a size a child can see.
 *
 * Reported as "why is the character so small?" — a Hero added to an empty
 * scene rendered about 0.6 world units on a 20-unit grid, roughly 3% of it,
 * with the transform gizmo several times larger than the character. A default
 * Scratch sprite is about 28% of the stage height.
 *
 * The cause was inherited, not accidental: each starter carried a hand-tuned
 * `size` (28, 34, 50, 55, 60) chosen to land at ~0.6u, a target that came from
 * the era of primitive capsule shapes and was never revisited once these
 * became real models. Sizes are now derived from each model's own bounds.
 *
 * Nothing here checks aesthetics. It checks that no starter can be added to a
 * scene at a size wildly different from its neighbours, which is what made the
 * old numbers drift apart unnoticed.
 */

const assert = require('assert');
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

/** Largest world-space dimension when added to a scene. */
function worldExtent(t) {
  const b = t.model_bounds;
  if (!b) return null;
  const extent = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
  return extent * (t.size / 100);
}

const modelled = CHARACTER_TEMPLATES.filter((t) => t.model_bounds);

test('the starters actually carry bounds to reason about', () => {
  assert.ok(modelled.length >= 50, `only ${modelled.length} starters have model_bounds`);
});

test('every starter is large enough to see on the scene grid', () => {
  // The grid is 20 units across. Below about 1u a character reads as a speck
  // next to its own transform gizmo, which is what was reported.
  const tooSmall = modelled
    .map((t) => [t.id, worldExtent(t)])
    .filter(([, w]) => w < 1.2);
  assert.deepStrictEqual(
    tooSmall.map(([id, w]) => `${id}=${w.toFixed(2)}u`),
    [],
    'these would be added to the scene too small to see'
  );
});

test('no starter is so large it fills the scene', () => {
  const tooBig = modelled
    .map((t) => [t.id, worldExtent(t)])
    .filter(([, w]) => w > 6);
  assert.deepStrictEqual(
    tooBig.map(([id, w]) => `${id}=${w.toFixed(2)}u`),
    [],
    'these would dominate the grid on arrival'
  );
});

test('starters arrive at a consistent size, whatever their mesh', () => {
  // The real regression risk: sizes drifting apart one hand-edit at a time,
  // which is exactly how they ended up spanning 28 to 60 before.
  const extents = modelled.map(worldExtent);
  const min = Math.min(...extents);
  const max = Math.max(...extents);
  assert.ok(
    max - min < 0.25,
    `starters span ${min.toFixed(2)}u to ${max.toFixed(2)}u — sizes have drifted apart`
  );
});

test('a car is scaled by its length, not its height', () => {
  // Normalising by height alone makes flat things enormous: a car is about a
  // fifth as tall as it is long, so height-normalisation would give it a size
  // five times too big.
  const car = CHARACTER_TEMPLATES.find((t) => t.id === 'car');
  assert.ok(car, 'car starter missing');
  const b = car.model_bounds;
  const height = b.max.y - b.min.y;
  const length = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  assert.ok(length > height, 'sanity: a car should be longer than it is tall');
  assert.ok(
    worldExtent(car) < 3,
    `car arrives ${worldExtent(car).toFixed(2)}u across — scaled by the wrong axis?`
  );
});

console.log(`\nstarter scale: ${passed} checks passed`);
