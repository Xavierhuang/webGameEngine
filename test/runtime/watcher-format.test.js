/**
 * Variable watchers must read like numbers a child recognises.
 *
 * Reported by looking at the Bounce Lab example, where the stage showed
 * `Ball: speed: -0.390000000000000024`. Nothing errored — the value was
 * correct — but it is the first thing a child sees when they build anything
 * that adds a fraction, which is most physics and most scoring.
 */

const assert = require('assert');
const { formatWatcherValue } = require('../.build/lib/runtime/watcherFormat');

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

test('the reported value is readable', () => {
  assert.strictEqual(formatWatcherValue(-0.390000000000000024), '-0.39');
});

test('accumulated float error is rounded away', () => {
  // 0.1 + 0.2 is the canonical one, and `change speed by 0.1` produces it.
  assert.strictEqual(formatWatcherValue(0.1 + 0.2), '0.3');
  let n = 0;
  for (let i = 0; i < 10; i++) n += 0.1;
  assert.strictEqual(formatWatcherValue(n), '1');
});

test('integers are untouched', () => {
  assert.strictEqual(formatWatcherValue(0), '0');
  assert.strictEqual(formatWatcherValue(42), '42');
  assert.strictEqual(formatWatcherValue(-7), '-7');
});

test('precision a child would notice is kept', () => {
  assert.strictEqual(formatWatcherValue(3.14159), '3.14159');
  assert.strictEqual(formatWatcherValue(0.000123), '0.000123');
});

test('precision below six places is deliberately given up', () => {
  // This is the trade-off, stated on purpose rather than discovered later:
  // the watcher is a display, not the value. Two numbers that differ in the
  // seventh decimal read the same on the stage, and the runtime still holds
  // both exactly. Without this, "0.30000000000000004" is what a child sees
  // after adding 0.1 and 0.2.
  assert.strictEqual(formatWatcherValue(1.0000001), '1');
  assert.strictEqual(formatWatcherValue(1.0000002), '1');
});

test('tiny magnitudes are not rounded to a misleading zero', () => {
  // 1e-9 shown as "0" reads as a different number entirely.
  assert.notStrictEqual(formatWatcherValue(1e-9), '0');
});

test('text and booleans pass through', () => {
  assert.strictEqual(formatWatcherValue('hello'), 'hello');
  assert.strictEqual(formatWatcherValue(true), 'true');
  assert.strictEqual(formatWatcherValue(false), 'false');
  assert.strictEqual(formatWatcherValue(''), '');
});

test('nothing shows as nothing, not "undefined"', () => {
  assert.strictEqual(formatWatcherValue(undefined), '');
  assert.strictEqual(formatWatcherValue(null), '');
});

console.log(`\nwatcher format: ${passed} checks passed`);
