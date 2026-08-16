/**
 * Video motion detection, tested against frames built by hand.
 *
 * This is why the maths is a pure function: a camera can tell you "something
 * happened", but only a constructed frame can tell you whether "moved right"
 * really reports right. Every case here has a known answer.
 */

const assert = require('assert');
const { detectMotion, detectMotionInRegion } = require('../.build/lib/video/motion');

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

const W = 64;
const H = 48;

/** A black frame. */
function blank() {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  return d;
}

/** A white square drawn at (x, y). */
function withSquare(x, y, size = 12) {
  const d = blank();
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = (py * W + px) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
    }
  }
  return d;
}

/** Degrees apart, accounting for the 360 wrap. */
const angleGap = (a, b) => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};

test('an unchanged frame reports no motion', () => {
  const frame = withSquare(20, 20);
  const r = detectMotion(frame, frame, W, H);
  assert.strictEqual(r.amount, 0, `still frame reported ${r.amount}`);
  assert.strictEqual(r.direction, 0);
});

test('a moving subject reports motion', () => {
  const r = detectMotion(withSquare(10, 20), withSquare(26, 20), W, H);
  assert.ok(r.amount > 0, 'a moved square must register');
});

test('moving right reports right, not some other direction', () => {
  // 0 degrees is right, matching the rest of the block language.
  const r = detectMotion(withSquare(10, 20), withSquare(28, 20), W, H);
  assert.ok(angleGap(r.direction, 0) < 30, `moved right but reported ${r.direction}°`);
});

test('moving left reports left', () => {
  const r = detectMotion(withSquare(28, 20), withSquare(10, 20), W, H);
  assert.ok(angleGap(r.direction, 180) < 30, `moved left but reported ${r.direction}°`);
});

test('moving up reports up, despite screen y growing downward', () => {
  // The easiest thing to get backwards, and invisible without a test: a camera
  // would just show "some direction".
  const r = detectMotion(withSquare(20, 30), withSquare(20, 12), W, H);
  assert.ok(angleGap(r.direction, 90) < 30, `moved up but reported ${r.direction}°`);
});

test('moving down reports down', () => {
  const r = detectMotion(withSquare(20, 12), withSquare(20, 30), W, H);
  assert.ok(angleGap(r.direction, 270) < 30, `moved down but reported ${r.direction}°`);
});

test('a bigger movement reports more motion than a smaller one', () => {
  const small = detectMotion(withSquare(20, 20), withSquare(23, 20), W, H);
  const large = detectMotion(withSquare(20, 20), withSquare(20, 20, 30), W, H);
  assert.ok(large.amount > small.amount, `${large.amount} should exceed ${small.amount}`);
});

test('sensor noise does not read as motion', () => {
  // A real camera jitters by a few levels every frame even pointed at a wall.
  // If that registered, `when video motion > 10` would fire constantly in an
  // empty room.
  const a = withSquare(20, 20);
  const b = Uint8ClampedArray.from(a, (v, i) => (i % 4 === 3 ? v : Math.min(255, v + 6)));
  const r = detectMotion(a, b, W, H);
  assert.strictEqual(r.amount, 0, `noise of 6 levels reported ${r.amount}`);
});

test('the amount is bounded to 0-100', () => {
  const black = blank();
  const white = new Uint8ClampedArray(W * H * 4).fill(255);
  const r = detectMotion(black, white, W, H);
  assert.ok(r.amount <= 100 && r.amount >= 0, `out of range: ${r.amount}`);
  assert.strictEqual(r.amount, 100, 'a whole frame changing should be the maximum');
});

test('the direction is always a usable compass bearing', () => {
  for (const [from, to] of [[[10, 10], [30, 30]], [[30, 30], [10, 10]], [[10, 30], [30, 10]]]) {
    const r = detectMotion(withSquare(...from), withSquare(...to), W, H);
    assert.ok(r.direction >= 0 && r.direction < 360, `direction ${r.direction} out of range`);
    assert.ok(Number.isFinite(r.direction), 'direction must be a number');
  }
});

test('malformed input returns zero rather than throwing', () => {
  // This runs every frame inside the game loop; an exception here would take
  // the whole game down mid-play.
  const frame = blank();
  assert.deepStrictEqual(detectMotion(frame, frame, 0, 0), { amount: 0, direction: 0 });
  assert.deepStrictEqual(detectMotion(frame, new Uint8ClampedArray(4), W, H), { amount: 0, direction: 0 });
  assert.deepStrictEqual(detectMotion(new Uint8ClampedArray(0), new Uint8ClampedArray(0), W, H), {
    amount: 0, direction: 0,
  });
  assert.deepStrictEqual(detectMotion(frame, frame, -5, -5), { amount: 0, direction: 0 });
});

test('a region only sees motion inside itself', () => {
  const before = withSquare(4, 4);
  const after = withSquare(20, 4);
  // A window far from the action must stay quiet.
  const quiet = detectMotionInRegion(before, after, W, H, { x: 40, y: 30, width: 20, height: 15 });
  assert.strictEqual(quiet.amount, 0, `an unrelated region reported ${quiet.amount}`);
  // One over the action must not.
  const busy = detectMotionInRegion(before, after, W, H, { x: 0, y: 0, width: 40, height: 24 });
  assert.ok(busy.amount > 0, 'the region containing the movement saw nothing');
});

test('a region hanging off the frame measures the part that is on it', () => {
  const r = detectMotionInRegion(withSquare(2, 2), withSquare(14, 2), W, H, {
    x: -20, y: -20, width: 60, height: 60,
  });
  assert.ok(r.amount > 0, 'a clamped region should still measure');
  const empty = detectMotionInRegion(withSquare(2, 2), withSquare(14, 2), W, H, {
    x: 100, y: 100, width: 10, height: 10,
  });
  assert.deepStrictEqual(empty, { amount: 0, direction: 0 }, 'a fully off-frame region must be silent');
});

console.log(`\nvideo motion: ${passed} checks passed`);
