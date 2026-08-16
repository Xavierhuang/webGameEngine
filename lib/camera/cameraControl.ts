/**
 * Camera behaviour: follow, shake and zoom.
 *
 * Pure and dependency-free — no THREE, no React. Takes a state and a timestep
 * and returns where the camera should be, so the feel of a follow and the decay
 * of a shake can be tested with numbers instead of by squinting at a screen.
 * `components/player/CameraDirector` applies the result.
 *
 * This is the piece Scratch cannot have: its stage is fixed, so "the camera
 * follows the player" is not a thing a child can express there. In 3D it is the
 * difference between a diorama and a game — and screen shake on an explosion is
 * the payoff the particle work set up.
 *
 * Framerate independence matters more here than anywhere else in the codebase.
 * A follow that lerps by a fixed fraction each frame is twice as fast at 120fps
 * as at 60, so a game would feel different on a good laptop than on a school
 * one. Smoothing is expressed as a half-life in seconds and converted per
 * timestep.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraState {
  /** Object being followed, or null for a fixed camera. */
  followTarget: string | null;
  /** Where the camera is currently looking, smoothed toward the target. */
  look: Vec3;
  /** 1 is the default framing; higher is closer. */
  zoom: number;
  /** Remaining shake, in seconds, and how violent it started. */
  shakeRemaining: number;
  shakeDuration: number;
  shakeStrength: number;
  /** Advances only while shaking, so the wobble is deterministic in tests. */
  shakeClock: number;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
/** Seconds for the camera to close half the distance to its target. */
const FOLLOW_HALF_LIFE = 0.18;
/** Beyond this a shake is nausea rather than impact. */
export const SHAKE_MAX = 3;

export function createCameraState(look: Vec3 = { x: 0, y: 0, z: 0 }): CameraState {
  return {
    followTarget: null,
    look: { ...look },
    zoom: 1,
    shakeRemaining: 0,
    shakeDuration: 0,
    shakeStrength: 0,
    shakeClock: 0,
  };
}

export function setFollowTarget(state: CameraState, target: string | null): CameraState {
  state.followTarget = target && target.trim() !== '' ? target : null;
  return state;
}

/** Clamped so a child cannot type 500 and lose their game inside a pixel. */
export function setZoom(state: CameraState, zoom: number): CameraState {
  const next = Number.isFinite(zoom) ? zoom : 1;
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
  return state;
}

export function changeZoom(state: CameraState, delta: number): CameraState {
  return setZoom(state, state.zoom + (Number.isFinite(delta) ? delta : 0));
}

/**
 * Start a shake. Re-shaking while one is running takes the stronger of the two
 * rather than adding, so `forever [ shake ]` stays a shake instead of climbing
 * until the screen is unreadable.
 */
export function startShake(state: CameraState, strength: number, seconds: number): CameraState {
  const s = Math.max(0, Math.min(SHAKE_MAX, Number.isFinite(strength) ? strength : 1));
  const d = Math.max(0, Math.min(10, Number.isFinite(seconds) ? seconds : 0.4));
  if (s === 0 || d === 0) return state;
  if (state.shakeRemaining > 0) {
    state.shakeStrength = Math.max(state.shakeStrength, s);
    state.shakeRemaining = Math.max(state.shakeRemaining, d);
    state.shakeDuration = Math.max(state.shakeDuration, d);
  } else {
    state.shakeStrength = s;
    state.shakeRemaining = d;
    state.shakeDuration = d;
    state.shakeClock = 0;
  }
  return state;
}

/** Fraction of the way to close per step, from a half-life in seconds. */
function smoothing(dt: number, halfLife: number): number {
  if (halfLife <= 0) return 1;
  return 1 - Math.pow(0.5, dt / halfLife);
}

/**
 * Deterministic wobble. Layered sine waves rather than random numbers so the
 * same moment of the same shake always looks the same — a random shake cannot
 * be tested, and it flickers rather than shakes at low frame rates.
 */
function wobble(clock: number, axis: number): number {
  const a = Math.sin(clock * 41.3 + axis * 1.7);
  const b = Math.sin(clock * 27.1 + axis * 4.9);
  return (a * 0.6 + b * 0.4);
}

export interface CameraFrame {
  /** Where to look, including any shake offset. */
  look: Vec3;
  /** Distance multiplier: divide the base camera distance by this. */
  zoom: number;
  /** Shake offset alone, for anything that wants to shake separately. */
  shake: Vec3;
}

/**
 * Advance one frame.
 *
 * `targetPosition` is where the followed object is, or null when nothing is
 * followed — in which case the camera holds its current look point.
 */
export function stepCamera(
  state: CameraState,
  dt: number,
  targetPosition: Vec3 | null
): CameraFrame {
  const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));

  if (state.followTarget && targetPosition) {
    const k = smoothing(step, FOLLOW_HALF_LIFE);
    state.look.x += (targetPosition.x - state.look.x) * k;
    state.look.y += (targetPosition.y - state.look.y) * k;
    state.look.z += (targetPosition.z - state.look.z) * k;
  }

  let shake: Vec3 = { x: 0, y: 0, z: 0 };
  if (state.shakeRemaining > 0) {
    state.shakeRemaining = Math.max(0, state.shakeRemaining - step);
    state.shakeClock += step;
    // Linear falloff: a shake that ends abruptly reads as a glitch.
    const fade = state.shakeDuration > 0 ? state.shakeRemaining / state.shakeDuration : 0;
    const amplitude = state.shakeStrength * fade * 0.35;
    shake = {
      x: wobble(state.shakeClock, 0) * amplitude,
      y: wobble(state.shakeClock, 1) * amplitude * 0.7,
      z: wobble(state.shakeClock, 2) * amplitude * 0.5,
    };
  }

  return {
    look: {
      x: state.look.x + shake.x,
      y: state.look.y + shake.y,
      z: state.look.z + shake.z,
    },
    zoom: state.zoom,
    shake,
  };
}

/** True while a shake is still playing. */
export function isShaking(state: CameraState): boolean {
  return state.shakeRemaining > 0;
}
