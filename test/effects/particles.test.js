/**
 * Particle simulation.
 *
 * Run with a seeded random source so every case has a real answer rather than
 * "something moved". A GPU can show you sparkles; only a deterministic run can
 * show you that confetti falls, smoke rises, and `forever [ burst ]` does not
 * grow without bound.
 */

const assert = require('assert');
const {
  createParticleState,
  setParticleSize,
  setParticleAmount,
  SCALE_MIN,
  SCALE_MAX,
  burstParticles,
  stepParticles,
  particleAlpha,
  presetSpec,
  isParticlePreset,
  PARTICLE_PRESETS,
  MAX_PARTICLES,
} = require('../.build/lib/effects/particles');

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

/** Deterministic 0-1 source. Same seed, same simulation, every run. */
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ORIGIN = { x: 0, y: 0, z: 0 };
/** Run a preset forward and report where its particles ended up. */
function simulate(preset, seconds = 0.6, dt = 1 / 60) {
  const random = seeded(7);
  const state = burstParticles(createParticleState(), preset, ORIGIN, random);
  const started = state.particles.length;
  for (let t = 0; t < seconds; t += dt) stepParticles(state, dt, { random });
  return { state, started };
}

test('a burst creates particles', () => {
  const { state, started } = simulate('sparkle', 0);
  assert.ok(started > 0, 'a burst produced nothing');
  assert.strictEqual(state.particles.length, started);
});

test('every preset is usable and named consistently', () => {
  assert.strictEqual(PARTICLE_PRESETS.length, 8);
  for (const preset of PARTICLE_PRESETS) {
    assert.ok(isParticlePreset(preset), `${preset} not recognised`);
    const spec = presetSpec(preset);
    assert.ok(spec.burst > 0, `${preset} bursts nothing`);
    assert.ok(spec.colours.length > 0, `${preset} has no colours`);
    assert.ok(spec.life[0] > 0 && spec.life[1] >= spec.life[0], `${preset} has a bad lifetime`);
  }
  assert.ok(!isParticlePreset('bananas'));
});

test('particles die, so a burst clears itself', () => {
  const longest = Math.max(...PARTICLE_PRESETS.map((p) => presetSpec(p).life[1]));
  const { state } = simulate('sparkle', longest + 0.5);
  assert.strictEqual(state.particles.length, 0, 'particles outlived their lifetime');
});

test('confetti falls and smoke rises', () => {
  // The clearest statement that presets actually differ, and the thing a child
  // would notice instantly if it were backwards.
  const confetti = simulate('confetti', 1.0);
  const smoke = simulate('smoke', 1.0);
  const meanY = (s) => s.state.particles.reduce((a, p) => a + p.y, 0) / s.state.particles.length;
  assert.ok(smoke.state.particles.length > 0 && confetti.state.particles.length > 0, 'nothing survived to compare');
  assert.ok(meanY(smoke) > 0, `smoke sank to ${meanY(smoke).toFixed(2)}`);
  assert.ok(meanY(confetti) < meanY(smoke), 'confetti should end up below smoke');
});

test('an explosion throws particles further than a sparkle', () => {
  const spread = (s) => {
    const ps = s.state.particles;
    return ps.reduce((a, p) => a + Math.hypot(p.x, p.y, p.z), 0) / (ps.length || 1);
  };
  const boom = spread(simulate('explosion', 0.3));
  const twinkle = spread(simulate('sparkle', 0.3));
  assert.ok(boom > twinkle, `explosion spread ${boom.toFixed(2)} vs sparkle ${twinkle.toFixed(2)}`);
});

test('a runaway loop cannot grow without bound', () => {
  // `forever [ burst confetti ]` is the first thing a child tries.
  const random = seeded(3);
  const state = createParticleState();
  for (let i = 0; i < 200; i++) {
    burstParticles(state, 'confetti', ORIGIN, random);
    assert.ok(
      state.particles.length <= MAX_PARTICLES,
      `grew to ${state.particles.length} after ${i} bursts`
    );
  }
  assert.strictEqual(state.particles.length, MAX_PARTICLES, 'the cap should be reached and held');
});

test('a trail emits steadily rather than in clumps', () => {
  const random = seeded(11);
  const state = createParticleState();
  // Half a second of trailing at 60fps.
  for (let i = 0; i < 30; i++) {
    stepParticles(state, 1 / 60, { trail: 'fire', at: ORIGIN, random });
  }
  const expected = presetSpec('fire').rate * 0.5;
  assert.ok(
    Math.abs(state.particles.length - expected) < expected * 0.4,
    `emitted ${state.particles.length}, expected roughly ${expected}`
  );
});

test('the emission rate does not depend on frame rate', () => {
  // Fractional particles are carried between frames; without that, a 60fps
  // machine and a 30fps machine would emit different amounts.
  const run = (dt, steps) => {
    const random = seeded(5);
    const state = createParticleState();
    for (let i = 0; i < steps; i++) stepParticles(state, dt, { trail: 'magic', at: ORIGIN, random });
    return state.particles.length;
  };
  const fast = run(1 / 60, 60); // one second
  const slow = run(1 / 30, 30); // one second
  assert.ok(Math.abs(fast - slow) <= Math.max(3, fast * 0.15), `60fps emitted ${fast}, 30fps emitted ${slow}`);
});

test('a burst mixed into a trail keeps its own physics', () => {
  // The bug this guards: holding the preset on the emitter instead of the
  // particle would apply fire's upward gravity to falling confetti.
  const random = seeded(13);
  const state = createParticleState();
  burstParticles(state, 'confetti', ORIGIN, random);
  const confettiCount = state.particles.length;
  for (let i = 0; i < 30; i++) stepParticles(state, 1 / 60, { trail: 'fire', at: ORIGIN, random });

  const confetti = state.particles.filter((p) => p.preset === 'confetti');
  const fire = state.particles.filter((p) => p.preset === 'fire');
  assert.ok(confetti.length > 0 && fire.length > 0, `expected both, got ${confetti.length}/${fire.length}`);
  assert.ok(confettiCount > 0);
  const meanY = (ps) => ps.reduce((a, p) => a + p.y, 0) / ps.length;
  assert.ok(meanY(fire) > meanY(confetti), 'fire should rise above the falling confetti');
});

test('a huge timestep cannot fling particles to infinity', () => {
  // A backgrounded tab delivers one enormous dt on return.
  const random = seeded(17);
  const state = burstParticles(createParticleState(), 'explosion', ORIGIN, random);
  stepParticles(state, 60, { random });
  for (const p of state.particles) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), 'particle left the number line');
    assert.ok(Math.hypot(p.x, p.y, p.z) < 100, `particle reached ${Math.hypot(p.x, p.y, p.z).toFixed(0)} units`);
  }
});

test('negative and zero timesteps are harmless', () => {
  const random = seeded(19);
  const state = burstParticles(createParticleState(), 'snow', ORIGIN, random);
  const before = state.particles.map((p) => ({ ...p }));
  stepParticles(state, 0, { random });
  stepParticles(state, -5, { random });
  assert.strictEqual(state.particles.length, before.length, 'a still frame killed particles');
});

test('particles fade out over their life', () => {
  const random = seeded(23);
  const state = burstParticles(createParticleState(), 'bubbles', ORIGIN, random);
  const p = state.particles[0];
  assert.ok(Math.abs(particleAlpha(p) - 1) < 0.01, 'a new particle should be opaque');
  p.age = p.life / 2;
  assert.ok(Math.abs(particleAlpha(p) - 0.5) < 0.05, 'half-lived should be half-faded');
  p.age = p.life;
  assert.strictEqual(particleAlpha(p), 0, 'a dead particle should be invisible');
});

test('a burst starts where it was asked to', () => {
  const random = seeded(29);
  const at = { x: 3, y: 1.5, z: -2 };
  const state = burstParticles(createParticleState(), 'magic', at, random);
  for (const p of state.particles) {
    assert.strictEqual(p.x, at.x);
    assert.strictEqual(p.y, at.y);
    assert.strictEqual(p.z, at.z);
  }
});

test('the same seed produces the same simulation', () => {
  // Without this the tests above would be measuring noise.
  const run = () => simulate('sparkle', 0.5).state.particles.map((p) => p.x.toFixed(6)).join(',');
  assert.strictEqual(run(), run());
});

test('particles settle on the ground instead of falling through it', () => {
  // Confetti has strong downward gravity. Without a floor it was below the
  // scene's ground plane within a second, which is why a trail looked like
  // nothing was happening.
  const random = seeded(31);
  const state = burstParticles(createParticleState(), 'confetti', { x: 0, y: 0, z: 0 }, random);
  for (let i = 0; i < 90; i++) stepParticles(state, 1 / 60, { random, floorY: -2 });
  const below = state.particles.filter((p) => p.y < -2.001);
  assert.deepStrictEqual(below.map((p) => p.y.toFixed(2)), [], 'particles fell through the floor');
  assert.ok(state.particles.length > 0, 'everything expired before the check was meaningful');
});

test('settled particles stay put rather than bouncing', () => {
  // Confetti is thrown upward first, so it needs a moment to come back down —
  // 60 frames was not long enough for any of it to land.
  const random = seeded(37);
  const state = burstParticles(createParticleState(), 'confetti', { x: 0, y: 0, z: 0 }, random);
  for (let i = 0; i < 90; i++) stepParticles(state, 1 / 60, { random, floorY: -0.5 });
  const resting = state.particles.filter((p) => Math.abs(p.y + 0.5) < 0.001);
  assert.ok(resting.length > 0, 'nothing reached the floor');
  for (const p of resting) assert.strictEqual(p.vy, 0, 'a settled particle kept vertical speed');
});

test('rising presets are unaffected by the floor', () => {
  const random = seeded(41);
  const state = burstParticles(createParticleState(), 'fire', { x: 0, y: 0, z: 0 }, random);
  for (let i = 0; i < 20; i++) stepParticles(state, 1 / 60, { random, floorY: -2 });
  const meanY = state.particles.reduce((a, p) => a + p.y, 0) / state.particles.length;
  assert.ok(meanY > 0, `fire sank to ${meanY.toFixed(2)}`);
});

test('particles are big enough to see next to a character', () => {
  // A character is 2.4 world units tall. These were tuned when one was 0.6u
  // and never rescaled, leaving a sparkle at under 3% of a character — which
  // is what "it's so small" meant.
  const CHARACTER = 2.4;
  for (const preset of PARTICLE_PRESETS) {
    const spec = presetSpec(preset);
    const mid = (spec.size[0] + spec.size[1]) / 2;
    const percent = (mid / CHARACTER) * 100;
    assert.ok(percent >= 5, `${preset} is ${percent.toFixed(1)}% of a character — too small to see`);
    assert.ok(percent <= 30, `${preset} is ${percent.toFixed(1)}% of a character — bigger than its own emitter`);
  }
});

test('the size dial actually changes particle size', () => {
  const measure = (scale) => {
    const random = seeded(43);
    const state = createParticleState();
    setParticleSize(state, scale);
    burstParticles(state, 'sparkle', ORIGIN, random);
    return state.particles.reduce((a, p) => a + p.size, 0) / state.particles.length;
  };
  const normal = measure(1);
  assert.ok(measure(2) > normal * 1.8, 'doubling the size did not double it');
  assert.ok(measure(0.5) < normal * 0.6, 'halving the size did not shrink it');
});

test('the amount dial actually changes how many appear', () => {
  const count = (scale) => {
    const random = seeded(47);
    const state = createParticleState();
    setParticleAmount(state, scale);
    burstParticles(state, 'sparkle', ORIGIN, random);
    return state.particles.length;
  };
  const normal = count(1);
  assert.ok(count(2) > normal, `2x gave ${count(2)} vs ${normal}`);
  assert.ok(count(0.25) < normal, `0.25x gave ${count(0.25)} vs ${normal}`);
});

test('the dials are clamped, and nonsense leaves them alone', () => {
  // `set particle size to 5000%` must not fill the screen with one square.
  const state = createParticleState();
  setParticleSize(state, 9999);
  assert.strictEqual(state.sizeScale, SCALE_MAX);
  setParticleSize(state, -5);
  assert.strictEqual(state.sizeScale, SCALE_MIN);
  setParticleAmount(state, NaN);
  assert.strictEqual(state.amountScale, 1, 'NaN should leave the dial at its default');
});

test('a huge amount still respects the hard cap', () => {
  const random = seeded(53);
  const state = createParticleState();
  setParticleAmount(state, SCALE_MAX);
  for (let i = 0; i < 50; i++) burstParticles(state, 'explosion', ORIGIN, random);
  assert.ok(state.particles.length <= MAX_PARTICLES, `grew to ${state.particles.length}`);
});

console.log(`\nparticles: ${passed} checks passed`);
