const {
  sampleAnimation,
  parseAnimations,
  inferDuration,
  findAnimation,
  groupByBone,
} = require('../.build/lib/models/customAnimation.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}
function close(actual, expected, label, tol = 1e-6) {
  const ok = Math.abs(actual - expected) < tol;
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ~${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}
function ok(cond, label) { eq(Boolean(cond), true, label); }

const anim = {
  name: 'Wave',
  duration: 2,
  keyframes: [
    { time: 0, boneName: 'ArmLeft', transform: { rotation: [0, 0, 0] } },
    { time: 1, boneName: 'ArmLeft', transform: { rotation: [0, 0, 2] } },
    { time: 2, boneName: 'ArmLeft', transform: { rotation: [0, 0, 0] } },
  ],
};

// --- interpolation ----------------------------------------------------------
close(sampleAnimation(anim, 0).ArmLeft.rotation[2], 0, 'at t=0 holds the first keyframe');
close(sampleAnimation(anim, 1).ArmLeft.rotation[2], 2, 'at t=1 hits the middle keyframe');
close(sampleAnimation(anim, 0.5).ArmLeft.rotation[2], 1, 'halfway interpolates linearly');
close(sampleAnimation(anim, 1.5).ArmLeft.rotation[2], 1, 'interpolates back down');

// --- looping ----------------------------------------------------------------
close(sampleAnimation(anim, 2.5).ArmLeft.rotation[2], 1, 'loops past the duration');
close(sampleAnimation(anim, 100.5).ArmLeft.rotation[2], 1, 'stable at large t');
close(sampleAnimation(anim, -0.5).ArmLeft.rotation[2], 1, 'negative t wraps forward, never NaN');

// --- clamping, not extrapolation --------------------------------------------
{
  const short = {
    name: 'Short', duration: 10,
    keyframes: [
      { time: 2, boneName: 'Head', transform: { rotation: [1, 0, 0] } },
      { time: 4, boneName: 'Head', transform: { rotation: [3, 0, 0] } },
    ],
  };
  close(sampleAnimation(short, 0).Head.rotation[0], 1, 'before the first keyframe holds it');
  close(sampleAnimation(short, 9).Head.rotation[0], 3, 'after the last keyframe holds it');
  // Extrapolating here would fling the limb far past its authored pose.
  ok(sampleAnimation(short, 9).Head.rotation[0] <= 3, 'never extrapolates beyond the last pose');
}

// --- defaults ---------------------------------------------------------------
{
  const s = sampleAnimation(anim, 0.5).ArmLeft;
  eq(s.scale[0], 1, 'missing scale defaults to 1');
  eq(s.position[0], 0, 'missing position defaults to 0');
}

// --- multiple bones are independent -----------------------------------------
{
  const two = {
    name: 'Two', duration: 2,
    keyframes: [
      { time: 0, boneName: 'ArmLeft', transform: { rotation: [0, 0, 0] } },
      { time: 2, boneName: 'ArmLeft', transform: { rotation: [0, 0, 2] } },
      { time: 0, boneName: 'LegRight', transform: { rotation: [5, 0, 0] } },
      { time: 2, boneName: 'LegRight', transform: { rotation: [1, 0, 0] } },
    ],
  };
  const s = sampleAnimation(two, 1);
  close(s.ArmLeft.rotation[2], 1, 'bone A interpolates');
  close(s.LegRight.rotation[0], 3, 'bone B interpolates independently');
}

// --- degenerate input must not crash or divide by zero ----------------------
eq(Object.keys(sampleAnimation({ name: 'x', duration: 1, keyframes: [] }, 1)).length, 0, 'no keyframes is empty');
eq(Object.keys(sampleAnimation(null, 1)).length, 0, 'null animation is safe');
{
  // Coincident keyframes would be a divide-by-zero.
  const dup = {
    name: 'Dup', duration: 2,
    keyframes: [
      { time: 1, boneName: 'Head', transform: { rotation: [0, 0, 0] } },
      { time: 1, boneName: 'Head', transform: { rotation: [9, 0, 0] } },
    ],
  };
  ok(Number.isFinite(sampleAnimation(dup, 1).Head.rotation[0]), 'coincident keyframes stay finite');
}
{
  const zero = { name: 'Z', duration: 0, keyframes: [{ time: 0, boneName: 'Head', transform: {} }] };
  ok(Number.isFinite(sampleAnimation(zero, 3).Head.rotation[0]), 'zero duration does not divide by zero');
}

// --- parsing untrusted JSON from properties.animations ----------------------
eq(parseAnimations(null).length, 0, 'null parses to nothing');
eq(parseAnimations('nope').length, 0, 'string parses to nothing');
eq(parseAnimations([{ name: '', keyframes: [] }]).length, 0, 'nameless animation rejected');
eq(parseAnimations([{ name: 'A', keyframes: [] }]).length, 0, 'keyframeless animation rejected');
eq(parseAnimations([{ name: 'A', keyframes: [{ time: 'x', boneName: 'H' }] }]).length, 0, 'non-numeric time rejected');
eq(parseAnimations([{ name: 'A', keyframes: [{ time: -1, boneName: 'H' }] }]).length, 0, 'negative time rejected');
eq(parseAnimations([{ name: 'A', keyframes: [{ time: 0, boneName: 42 }] }]).length, 0, 'non-string bone rejected');
{
  const parsed = parseAnimations([
    { name: ' Wave ', keyframes: [{ time: 0, boneName: 'H', transform: { rotation: [1, 2, 3] } }] },
  ]);
  eq(parsed.length, 1, 'valid animation accepted');
  eq(parsed[0].name, 'Wave', 'name is trimmed');
  ok(parsed[0].duration > 0, 'duration inferred when absent');
  // A malformed transform must not become a partial array.
  const bad = parseAnimations([
    { name: 'B', keyframes: [{ time: 0, boneName: 'H', transform: { rotation: [1, 2] } }] },
  ]);
  eq(bad[0].keyframes[0].transform.rotation, undefined, 'short rotation array dropped');
}

// --- duration inference -----------------------------------------------------
eq(inferDuration([{ time: 0 }, { time: 3.5 }, { time: 1 }]), 3.5, 'duration is the latest keyframe');
eq(inferDuration([]), 1, 'empty keyframes fall back to 1s');

// --- lookup is case-insensitive (block fields are free text) ----------------
{
  const list = parseAnimations([{ name: 'Wave', keyframes: [{ time: 0, boneName: 'H' }] }]);
  ok(findAnimation(list, 'wave'), 'lookup is case-insensitive');
  ok(findAnimation(list, '  WAVE '), 'lookup trims whitespace');
  eq(findAnimation(list, 'nope'), undefined, 'unknown name returns undefined');
  eq(findAnimation(list, ''), undefined, 'empty name returns undefined');
}

// --- grouping sorts by time -------------------------------------------------
{
  const g = groupByBone([
    { time: 3, boneName: 'A', transform: {} },
    { time: 1, boneName: 'A', transform: {} },
  ]);
  eq(g.get('A')[0].time, 1, 'keyframes are sorted by time regardless of input order');
}

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll custom-animation tests passed');
