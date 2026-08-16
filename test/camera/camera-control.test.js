/**
 * Camera follow, shake and zoom.
 *
 * These are feel features, and feel is exactly what a screenshot cannot check.
 * What a test can check is that a follow converges rather than oscillating,
 * that it behaves the same at 30fps as at 120, that a shake decays to nothing
 * and cannot be stacked into nausea, and that a child typing 500 into the zoom
 * box does not lose their game inside a pixel.
 */

const assert = require('assert');
const {
  createCameraState,
  setFollowTarget,
  setZoom,
  changeZoom,
  startShake,
  stepCamera,
  isShaking,
  ZOOM_MIN,
  ZOOM_MAX,
  SHAKE_MAX,
} = require('../.build/lib/camera/cameraControl');

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

const at = (x, y, z) => ({ x, y, z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Run for `seconds` at a given frame rate. */
function run(state, seconds, dt, target) {
  let last = null;
  for (let t = 0; t < seconds; t += dt) last = stepCamera(state, dt, target);
  return last;
}

test('a fixed camera does not drift', () => {
  const s = createCameraState(at(0, 0, 0));
  const frame = run(s, 1, 1 / 60, at(5, 5, 5));
  assert.strictEqual(frame.look.x, 0, 'an unfollowed camera moved');
  assert.strictEqual(frame.look.z, 0);
});

test('following converges on the target', () => {
  const s = setFollowTarget(createCameraState(at(0, 0, 0)), 'Hero');
  const target = at(10, 0, -6);
  const frame = run(s, 2, 1 / 60, target);
  assert.ok(dist(frame.look, target) < 0.05, `still ${dist(frame.look, target).toFixed(2)} away after 2s`);
});

test('following lags rather than snapping', () => {
  // A camera that teleports to its target is a parented camera, not a follow,
  // and reads as stiff.
  const s = setFollowTarget(createCameraState(at(0, 0, 0)), 'Hero');
  const frame = stepCamera(s, 1 / 60, at(10, 0, 0));
  assert.ok(frame.look.x > 0, 'the camera did not move at all');
  assert.ok(frame.look.x < 5, `snapped ${frame.look.x.toFixed(2)} of 10 in one frame`);
});

test('the follow feels the same at 30fps as at 120fps', () => {
  // The bug this prevents: lerping a fixed fraction per frame makes the camera
  // twice as fast on a good laptop as on a school one.
  const target = at(8, 0, 0);
  const slow = run(setFollowTarget(createCameraState(at(0, 0, 0)), 'H'), 0.5, 1 / 30, target);
  const fast = run(setFollowTarget(createCameraState(at(0, 0, 0)), 'H'), 0.5, 1 / 120, target);
  assert.ok(
    Math.abs(slow.look.x - fast.look.x) < 0.2,
    `30fps reached ${slow.look.x.toFixed(2)}, 120fps reached ${fast.look.x.toFixed(2)}`
  );
});

test('clearing the target stops the camera where it is', () => {
  const s = setFollowTarget(createCameraState(at(0, 0, 0)), 'Hero');
  run(s, 1, 1 / 60, at(6, 0, 0));
  const stopped = setFollowTarget(s, null);
  const before = { ...stopped.look };
  const frame = run(stopped, 1, 1 / 60, at(-20, 0, 0));
  assert.ok(dist(frame.look, before) < 0.001, 'the camera kept following after being told to stop');
});

test('a shake decays to nothing', () => {
  const s = startShake(createCameraState(), 2, 0.5);
  assert.ok(isShaking(s), 'the shake did not start');
  const mid = stepCamera(s, 0.1, null);
  assert.ok(Math.abs(mid.shake.x) + Math.abs(mid.shake.y) > 0, 'no wobble while shaking');
  run(s, 0.7, 1 / 60, null);
  assert.ok(!isShaking(s), 'the shake never ended');
  const after = stepCamera(s, 1 / 60, null);
  assert.deepStrictEqual(after.shake, { x: 0, y: 0, z: 0 }, 'still wobbling after it ended');
});

test('a shake fades out instead of stopping dead', () => {
  const s = startShake(createCameraState(), 3, 1);
  const early = Math.abs(stepCamera(s, 0.05, null).shake.x);
  run(s, 0.8, 1 / 60, null);
  const late = Math.abs(stepCamera(s, 0.05, null).shake.x);
  assert.ok(late < early, `shake grew from ${early.toFixed(3)} to ${late.toFixed(3)}`);
});

test('repeated shaking does not stack into nausea', () => {
  // `forever [ shake ]` is the first thing a child will try.
  const s = createCameraState();
  let peak = 0;
  for (let i = 0; i < 200; i++) {
    startShake(s, 2, 0.4);
    const f = stepCamera(s, 1 / 60, null);
    peak = Math.max(peak, Math.abs(f.shake.x), Math.abs(f.shake.y));
  }
  assert.ok(peak < SHAKE_MAX, `shake reached ${peak.toFixed(2)}, beyond the cap`);
});

test('shake strength and duration are bounded', () => {
  const s = startShake(createCameraState(), 999, 999);
  assert.ok(s.shakeStrength <= SHAKE_MAX, `strength ${s.shakeStrength}`);
  assert.ok(s.shakeDuration <= 10, `duration ${s.shakeDuration}`);
  const zero = startShake(createCameraState(), 0, 1);
  assert.ok(!isShaking(zero), 'a zero-strength shake should be a no-op');
});

test('zoom is clamped so a game cannot be lost inside a pixel', () => {
  assert.strictEqual(setZoom(createCameraState(), 500).zoom, ZOOM_MAX);
  assert.strictEqual(setZoom(createCameraState(), -3).zoom, ZOOM_MIN);
  assert.strictEqual(setZoom(createCameraState(), 0).zoom, ZOOM_MIN);
  const s = createCameraState();
  changeZoom(s, 100);
  assert.strictEqual(s.zoom, ZOOM_MAX);
  changeZoom(s, -100);
  assert.strictEqual(s.zoom, ZOOM_MIN);
});

test('nonsense input never produces a broken camera', () => {
  // This runs inside the render loop; NaN here would black out the game.
  const s = setFollowTarget(createCameraState(), 'Hero');
  setZoom(s, NaN);
  startShake(s, NaN, NaN);
  const frames = [
    stepCamera(s, NaN, at(1, 2, 3)),
    stepCamera(s, -5, at(1, 2, 3)),
    stepCamera(s, 60, at(1, 2, 3)),
    stepCamera(s, 1 / 60, null),
  ];
  for (const f of frames) {
    for (const v of [f.look.x, f.look.y, f.look.z, f.zoom, f.shake.x]) {
      assert.ok(Number.isFinite(v), `produced ${v}`);
    }
    assert.ok(f.zoom >= ZOOM_MIN && f.zoom <= ZOOM_MAX, `zoom ${f.zoom} out of range`);
  }
});

test('the same shake looks the same every time', () => {
  // Deterministic wobble: a random shake cannot be tested, and it flickers
  // rather than shakes when frames are uneven.
  const play = () => {
    const s = startShake(createCameraState(), 2, 0.5);
    const out = [];
    for (let i = 0; i < 10; i++) out.push(stepCamera(s, 1 / 60, null).shake.x.toFixed(6));
    return out.join(',');
  };
  assert.strictEqual(play(), play());
});

console.log(`\ncamera control: ${passed} checks passed`);
