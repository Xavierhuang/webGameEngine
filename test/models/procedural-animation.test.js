const {
  classifyPart,
  partTransform,
  isAnimating,

} = require('../.build/lib/models/proceduralAnimation.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}
function ok(cond, label) { eq(Boolean(cond), true, label); }

// --- the actual node names in the shipped starter GLBs ---------------------
eq(classifyPart('ArmLeft'), 'armLeft', 'ArmLeft');
eq(classifyPart('ArmRight'), 'armRight', 'ArmRight');
eq(classifyPart('LegLeft'), 'legLeft', 'LegLeft');
eq(classifyPart('LegRight'), 'legRight', 'LegRight');
eq(classifyPart('BootLeft'), 'legLeft', 'BootLeft counts as a leg');
eq(classifyPart('GloveRight'), 'armRight', 'GloveRight counts as an arm');
eq(classifyPart('Head'), 'head', 'Head');
eq(classifyPart('Torso'), 'torso', 'Torso');
eq(classifyPart('ChestEmblem'), 'torso', 'ChestEmblem');
eq(classifyPart('EyeLeft'), 'other', 'eyes are not animated limbs');
eq(classifyPart('Hair'), 'other', 'hair is not an animated limb');
eq(classifyPart(''), 'other', 'empty name is safe');

// --- naming conventions an uploaded model might use ------------------------
eq(classifyPart('left_arm'), 'armLeft', 'snake_case left_arm');
eq(classifyPart('Right Leg'), 'legRight', 'spaced Right Leg');
eq(classifyPart('mixamorig:LeftFoot'), 'legLeft', 'mixamo-style LeftFoot');

// --- stopped states must not move anything --------------------------------
eq(isAnimating('stop'), false, 'stop is not animating');
eq(isAnimating('none'), false, 'none is not animating');
eq(isAnimating(null), false, 'null is not animating');
eq(isAnimating('walk'), true, 'walk is animating');
for (const s of ['stop', 'none']) {
  const d = partTransform('armLeft', s, 1.23);
  eq(d.rotationX, 0, `${s}: no rotation`);
  eq(d.offsetY, 0, `${s}: no bob`);
}

// --- walking actually moves the limbs -------------------------------------
{
  // Quarter-cycle into the walk gait, sin() is at its peak.
  const t = Math.PI / 2 / 5.0;
  const armL = partTransform('armLeft', 'walk', t);
  const legL = partTransform('legLeft', 'walk', t);
  ok(Math.abs(armL.rotationX) > 0.1, 'walk swings the left arm');
  ok(Math.abs(legL.rotationX) > 0.1, 'walk swings the left leg');
  // Arms oppose the leg on the same side — that is what reads as walking.
  ok(Math.sign(armL.rotationX) !== Math.sign(legL.rotationX), 'left arm opposes left leg');

  const armR = partTransform('armRight', 'walk', t);
  ok(Math.sign(armL.rotationX) !== Math.sign(armR.rotationX), 'arms oppose each other');
}

// --- run is a bigger, faster swing than walk ------------------------------
{
  const peak = (state, speed) => Math.abs(partTransform('legLeft', state, Math.PI / 2 / speed).rotationX);
  ok(peak('run', 9.0) > peak('walk', 5.0), 'run swings wider than walk');
  ok(peak('walk', 5.0) > peak('idle', 1.6), 'walk swings wider than idle');
}

// --- jump and fall are held poses, not cycles ------------------------------
{
  const a = partTransform('armLeft', 'jump', 0.1);
  const b = partTransform('armLeft', 'jump', 7.9);
  eq(a.rotationX, b.rotationX, 'jump pose is constant over time');
  ok(a.rotationX < -1, 'jump raises the arms');

  const fallL = partTransform('armLeft', 'fall', 2);
  const fallR = partTransform('armRight', 'fall', 2);
  ok(Math.sign(fallL.rotationZ) !== Math.sign(fallR.rotationZ), 'fall splays arms outward');
}

// --- unknown state degrades to the idle gait rather than throwing ---------
{
  const d = partTransform('legLeft', 'moonwalk', 1);
  ok(Number.isFinite(d.rotationX), 'unknown state returns finite numbers');
}

// --- 'other' parts are never moved ----------------------------------------
for (const s of ['idle', 'walk', 'run', 'jump', 'fall']) {
  const d = partTransform('other', s, 1);
  eq(d.rotationX + d.rotationY + d.rotationZ + d.offsetY, 0, `${s}: 'other' parts stay put`);
}

// --- torso bob is always upward (never sinks through the floor) -----------
for (let i = 0; i < 20; i++) {
  const d = partTransform('torso', 'run', i * 0.1);
  if (d.offsetY < 0) { failures++; console.log('FAIL torso bob went negative'); break; }
}
ok(true, 'torso bob never goes negative');

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll procedural-animation tests passed');
