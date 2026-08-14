/**
 * Procedural per-part animation for models that ship no animation clips.
 *
 * Pure maths, no THREE import, so it can be unit-tested in node.
 *
 * Every starter GLB produced by tools/metal-starters contains **zero**
 * animation clips — verified by reading the GLB JSON chunk. The editor's
 * Idle/Walk/Run/Jump/Fall dropdown drives a real THREE.AnimationMixer, so for
 * those models it selected a clip that did not exist and nothing moved: the
 * control looked functional and did nothing.
 *
 * The starters do, however, name their parts semantically (`Head`, `ArmLeft`,
 * `LegRight`, `Torso`, …), which is enough to animate them by rotating limbs
 * about sensible axes. This module maps (part name, state, time) to a rotation
 * offset in radians, applied on top of each part's rest pose.
 */

export type AnimationState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'stop' | 'none';

export type PartKind = 'head' | 'armLeft' | 'armRight' | 'legLeft' | 'legRight' | 'torso' | 'other';

export interface PartTransform {
  /** Radians, added to the part's rest rotation. */
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  /** World-units offset added to the part's rest position (used for bob). */
  offsetY: number;
}

export const REST: PartTransform = { rotationX: 0, rotationY: 0, rotationZ: 0, offsetY: 0 };

/**
 * Classify a node by name. Deliberately forgiving — matches `ArmLeft`,
 * `arm_left`, `LeftArm`, `l_arm` and similar, because uploaded models don't
 * follow the starters' convention.
 */
export function classifyPart(name: string): PartKind {
  const n = (name || '').toLowerCase().replace(/[_\-.\s]/g, '');
  if (!n) return 'other';

  // Left is the default side, so only "right" needs detecting.
  const isRight = n.includes('right') || /(^|[^a-z])r($|[^a-z])/.test(n);

  // Check limbs before head: "forearm" contains neither, but "headband" would
  // otherwise beat a more specific limb match.
  if (n.includes('arm') || n.includes('hand') || n.includes('glove')) {
    return isRight ? 'armRight' : 'armLeft';
  }
  if (n.includes('leg') || n.includes('foot') || n.includes('boot') || n.includes('shoe') || n.includes('thigh')) {
    return isRight ? 'legRight' : 'legLeft';
  }
  if (n.includes('head') || n.includes('skull')) return 'head';
  if (n.includes('torso') || n.includes('chest') || n.includes('body') || n.includes('spine')) return 'torso';
  return 'other';
}

/** Cycle speed and swing amplitude per state. */
const GAIT: Record<string, { speed: number; swing: number; bob: number }> = {
  idle: { speed: 1.6, swing: 0.06, bob: 0.012 },
  walk: { speed: 5.0, swing: 0.5, bob: 0.03 },
  run: { speed: 9.0, swing: 0.85, bob: 0.06 },
};

/**
 * Rotation offset for one part at time `t` (seconds).
 *
 * Arms and legs swing in antiphase — left arm forward with right leg — which is
 * what reads as walking. Jump and fall are poses rather than cycles.
 */
export function partTransform(
  part: PartKind,
  state: AnimationState | string,
  t: number
): PartTransform {
  if (!state || state === 'stop' || state === 'none') return REST;

  if (state === 'jump') {
    // Arms up, legs tucked — a held pose, not a cycle.
    switch (part) {
      case 'armLeft':
      case 'armRight':
        return { ...REST, rotationX: -2.0 };
      case 'legLeft':
      case 'legRight':
        return { ...REST, rotationX: 0.6 };
      case 'torso':
        return { ...REST, offsetY: 0.04 };
      default:
        return REST;
    }
  }

  if (state === 'fall') {
    switch (part) {
      case 'armLeft':
        return { ...REST, rotationX: -1.2, rotationZ: -0.5 };
      case 'armRight':
        return { ...REST, rotationX: -1.2, rotationZ: 0.5 };
      case 'legLeft':
        return { ...REST, rotationX: -0.35 };
      case 'legRight':
        return { ...REST, rotationX: 0.35 };
      default:
        return REST;
    }
  }

  const gait = GAIT[state] ?? GAIT.idle;
  const phase = t * gait.speed;
  const swing = Math.sin(phase) * gait.swing;

  switch (part) {
    // Limbs swing about X (forward/back). Left and right are opposed, and arms
    // oppose the leg on the same side.
    case 'armLeft':
      return { ...REST, rotationX: swing };
    case 'armRight':
      return { ...REST, rotationX: -swing };
    case 'legLeft':
      return { ...REST, rotationX: -swing };
    case 'legRight':
      return { ...REST, rotationX: swing };
    case 'head':
      // A small counter-bob so the head doesn't feel welded on.
      return { ...REST, rotationZ: Math.sin(phase * 0.5) * gait.swing * 0.12 };
    case 'torso':
      // Two bobs per stride — the body rises on each footfall.
      return { ...REST, offsetY: Math.abs(Math.sin(phase)) * gait.bob };
    default:
      return REST;
  }
}

/** Whether a state should drive procedural motion at all. */
export function isAnimating(state: AnimationState | string | null | undefined): boolean {
  return Boolean(state) && state !== 'stop' && state !== 'none';
}
