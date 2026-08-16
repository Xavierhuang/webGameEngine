/**
 * Particle effects.
 *
 * Pure and dependency-free: no THREE, no React, no DOM. The simulation takes a
 * state and a timestep and returns a new state, so every rule about how
 * sparkles behave can be tested without a GPU. `components/player/ParticleField`
 * turns the output into a THREE.Points cloud.
 *
 * Two decisions shape the whole design:
 *
 * **Presets, not parameters.** A child does not want emission rate, lifetime
 * variance and initial velocity cones. They want sparkles. Every effect is a
 * named preset — `sparkle`, `fire`, `confetti` — chosen from a dropdown, and
 * the numbers live here where they can be tuned once for everyone.
 *
 * **A hard cap, always.** This runs beside a 3D scene on a school laptop, and
 * `forever [ burst confetti ]` is the first thing a child will try. Emitters
 * recycle the oldest particle rather than growing, so a runaway loop costs
 * frames, never memory.
 *
 * Randomness is injected rather than taken from Math.random, so the tests can
 * run the simulation deterministically and assert real behaviour instead of
 * "something moved".
 */

export type ParticlePreset =
  | 'sparkle'
  | 'smoke'
  | 'fire'
  | 'confetti'
  | 'bubbles'
  | 'magic'
  | 'explosion'
  | 'snow';

export const PARTICLE_PRESETS: ParticlePreset[] = [
  'sparkle', 'smoke', 'fire', 'confetti', 'bubbles', 'magic', 'explosion', 'snow',
];

/** One particle. Flat numbers so the renderer can copy straight into buffers. */
export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Seconds lived, and total lifetime. Dead when age >= life. */
  age: number; life: number;
  size: number;
  /** 0-1 RGB, resolved at spawn so a preset can vary colour per particle. */
  r: number; g: number; b: number;
  /**
   * Which preset's physics this particle follows.
   *
   * Stored per particle, not per emitter: a child can burst confetti while a
   * fire trail is running, and those two need different gravity in the same
   * state. Holding it on the emitter instead would silently apply one
   * preset's physics to the other's particles.
   */
  preset: ParticlePreset;
}

export interface ParticleState {
  particles: Particle[];
  /** Fractional particles owed by a continuous emitter between frames. */
  pending: number;
}

interface PresetSpec {
  /** Particles per second while trailing, and per burst. */
  rate: number;
  burst: number;
  life: [number, number];
  size: [number, number];
  /** Initial speed range and how much of it is upward rather than radial. */
  speed: [number, number];
  upward: number;
  /** World units per second squared. Negative falls. */
  gravity: number;
  /** Velocity retained per second — below 1 the particle slows down. */
  drag: number;
  /** Colours chosen from at spawn, as 0-1 RGB. */
  colours: [number, number, number][];
}

const SPECS: Record<ParticlePreset, PresetSpec> = {
  sparkle: {
    rate: 30, burst: 24, life: [0.4, 0.9], size: [0.04, 0.10], speed: [0.6, 1.6],
    upward: 0.5, gravity: -0.8, drag: 0.86,
    colours: [[1, 0.95, 0.55], [1, 1, 1], [1, 0.85, 0.25]],
  },
  smoke: {
    rate: 18, burst: 14, life: [1.0, 2.0], size: [0.12, 0.28], speed: [0.15, 0.45],
    upward: 0.9, gravity: 0.25, drag: 0.9,
    colours: [[0.62, 0.62, 0.66], [0.75, 0.75, 0.78], [0.5, 0.5, 0.54]],
  },
  fire: {
    rate: 42, burst: 26, life: [0.3, 0.7], size: [0.08, 0.18], speed: [0.5, 1.3],
    upward: 0.95, gravity: 0.9, drag: 0.88,
    colours: [[1, 0.55, 0.1], [1, 0.8, 0.2], [0.9, 0.25, 0.08]],
  },
  confetti: {
    rate: 26, burst: 40, life: [1.2, 2.4], size: [0.06, 0.13], speed: [1.0, 2.4],
    upward: 0.7, gravity: -2.6, drag: 0.95,
    colours: [[0.95, 0.3, 0.4], [0.3, 0.7, 0.95], [0.99, 0.83, 0.25],
              [0.45, 0.85, 0.45], [0.75, 0.45, 0.9]],
  },
  bubbles: {
    rate: 14, burst: 12, life: [1.4, 2.6], size: [0.07, 0.17], speed: [0.2, 0.6],
    upward: 0.95, gravity: 0.5, drag: 0.97,
    colours: [[0.7, 0.9, 1], [0.85, 0.95, 1], [0.6, 0.85, 0.98]],
  },
  magic: {
    rate: 34, burst: 28, life: [0.6, 1.4], size: [0.05, 0.12], speed: [0.8, 1.8],
    upward: 0.3, gravity: 0.15, drag: 0.9,
    colours: [[0.75, 0.45, 0.95], [0.95, 0.55, 0.85], [0.55, 0.65, 1]],
  },
  explosion: {
    rate: 0, burst: 60, life: [0.35, 0.8], size: [0.09, 0.22], speed: [2.5, 5.5],
    upward: 0.25, gravity: -1.8, drag: 0.78,
    colours: [[1, 0.62, 0.15], [1, 0.35, 0.1], [0.35, 0.32, 0.3]],
  },
  snow: {
    rate: 16, burst: 20, life: [2.0, 3.5], size: [0.05, 0.11], speed: [0.1, 0.35],
    upward: 0.1, gravity: -0.35, drag: 0.99,
    colours: [[1, 1, 1], [0.9, 0.94, 1]],
  },
};

/** Hard ceiling per emitter. `forever [ burst confetti ]` must not grow. */
export const MAX_PARTICLES = 300;

export function createParticleState(): ParticleState {
  return { particles: [], pending: 0 };
}

export function isParticlePreset(value: string): value is ParticlePreset {
  return (PARTICLE_PRESETS as string[]).includes(value);
}

/** A random source, so tests can be deterministic. Returns 0-1. */
export type Random = () => number;

function between(random: Random, [lo, hi]: [number, number]): number {
  return lo + random() * (hi - lo);
}

function spawn(
  preset: ParticlePreset,
  at: { x: number; y: number; z: number },
  random: Random
): Particle {
  const spec = SPECS[preset];
  const speed = between(random, spec.speed);

  // Direction: a random point on a sphere, biased upward by the preset. A
  // fountain and an explosion differ mostly in how much of the speed is up.
  const theta = random() * Math.PI * 2;
  const phi = Math.acos(2 * random() - 1);
  const rx = Math.sin(phi) * Math.cos(theta);
  const ry = Math.cos(phi);
  const rz = Math.sin(phi) * Math.sin(theta);
  const up = spec.upward;

  const colour = spec.colours[Math.floor(random() * spec.colours.length)] ?? [1, 1, 1];

  return {
    x: at.x, y: at.y, z: at.z,
    vx: rx * speed * (1 - up),
    vy: (Math.abs(ry) * up + ry * (1 - up)) * speed,
    vz: rz * speed * (1 - up),
    age: 0,
    life: between(random, spec.life),
    size: between(random, spec.size),
    r: colour[0], g: colour[1], b: colour[2],
    preset,
  };
}

/** Add particles without exceeding the cap, dropping the oldest first. */
function admit(state: ParticleState, born: Particle[]): void {
  state.particles.push(...born);
  const excess = state.particles.length - MAX_PARTICLES;
  if (excess > 0) state.particles.splice(0, excess);
}

/** One-shot burst at a point. */
export function burstParticles(
  state: ParticleState,
  preset: ParticlePreset,
  at: { x: number; y: number; z: number },
  random: Random = Math.random,
  count?: number
): ParticleState {
  const total = Math.max(0, Math.min(MAX_PARTICLES, count ?? SPECS[preset].burst));
  const born: Particle[] = [];
  for (let i = 0; i < total; i++) born.push(spawn(preset, at, random));
  admit(state, born);
  return state;
}

/**
 * Advance the simulation, emitting continuously if `trail` is set.
 *
 * `dt` is clamped: a tab restored after a minute in the background would
 * otherwise deliver one enormous step and fling every particle to infinity.
 */
export function stepParticles(
  state: ParticleState,
  dt: number,
  options: {
    trail?: ParticlePreset | null;
    at?: { x: number; y: number; z: number };
    random?: Random;
    /**
     * Ground level. Particles settle here instead of continuing downward.
     *
     * Without it, anything with negative gravity — confetti, sparks, snow —
     * falls straight through the floor and out of sight within a second, which
     * is what made a confetti trail look like nothing was happening at all.
     */
    floorY?: number;
  } = {}
): ParticleState {
  const step = Math.max(0, Math.min(0.1, dt));
  const random = options.random ?? Math.random;

  if (options.trail && options.at) {
    const spec = SPECS[options.trail];
    state.pending += spec.rate * step;
    const due = Math.floor(state.pending);
    if (due > 0) {
      state.pending -= due;
      const born: Particle[] = [];
      for (let i = 0; i < Math.min(due, MAX_PARTICLES); i++) {
        born.push(spawn(options.trail, options.at, random));
      }
      admit(state, born);
    }
  }

  const alive: Particle[] = [];
  for (const p of state.particles) {
    p.age += step;
    if (p.age >= p.life) continue;

    // Presets name their own physics, so `drag` is per-second and has to be
    // raised to the timestep or the simulation would depend on frame rate.
    const spec = SPECS[p.preset] ?? SPECS.sparkle;
    const decay = Math.pow(spec.drag, step * 60);
    p.vx *= decay;
    p.vy *= decay;
    p.vz *= decay;
    p.vy += spec.gravity * step;

    p.x += p.vx * step;
    p.y += p.vy * step;
    p.z += p.vz * step;

    if (options.floorY !== undefined && p.y < options.floorY) {
      // Settle rather than bounce: a bouncing sparkle reads as a bug, and a
      // scatter of confetti lying on the ground reads as confetti.
      p.y = options.floorY;
      p.vy = 0;
      p.vx *= 0.5;
      p.vz *= 0.5;
    }

    alive.push(p);
  }
  state.particles = alive;
  return state;
}

/** Fade factor for a particle, 1 at birth to 0 at death. */
export function particleAlpha(p: Particle): number {
  const t = p.life > 0 ? p.age / p.life : 1;
  return Math.max(0, Math.min(1, 1 - t));
}

/** Read-only view of a preset, for the renderer and for tests. */
export function presetSpec(preset: ParticlePreset): Readonly<PresetSpec> {
  return SPECS[preset];
}
