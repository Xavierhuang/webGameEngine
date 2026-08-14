/**
 * Custom keyframe animations — sampling and validation.
 *
 * Pure maths, no THREE import, so it can be unit-tested in node and shared by
 * the editor's preview, the scene view and the player.
 *
 * The Animation Editor could add keyframes and export them to a JSON file, but
 * its Play button only flipped a boolean (`// TODO: Implement animation
 * playback`) and it ignored the `objectId` it was handed, so nothing a child
 * made there could be played back or saved. This module is the missing engine.
 */

export interface KeyframeTransform {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface Keyframe {
  /** Seconds from the start of the animation. */
  time: number;
  boneName: string;
  transform: KeyframeTransform;
}

export interface CustomAnimation {
  name: string;
  /** Seconds. Playback loops over this window. */
  duration: number;
  keyframes: Keyframe[];
}

/** Per-part sample at a point in time; keys are bone names. */
export type AnimationSample = Record<string, Required<KeyframeTransform>>;

const IDENTITY: Required<KeyframeTransform> = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpTriple(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Group keyframes by bone, each sorted by time. */
export function groupByBone(keyframes: Keyframe[]): Map<string, Keyframe[]> {
  const byBone = new Map<string, Keyframe[]>();
  for (const kf of keyframes) {
    if (!kf || typeof kf.boneName !== 'string') continue;
    const list = byBone.get(kf.boneName) ?? [];
    list.push(kf);
    byBone.set(kf.boneName, list);
  }
  for (const list of byBone.values()) list.sort((a, b) => a.time - b.time);
  return byBone;
}

/**
 * Sample every animated bone at time `t` (seconds), looping over `duration`.
 *
 * Before the first keyframe a bone holds that keyframe's value, and after the
 * last it holds the last — no extrapolation, which would fling limbs off.
 */
export function sampleAnimation(animation: CustomAnimation, t: number): AnimationSample {
  const sample: AnimationSample = {};
  if (!animation || !Array.isArray(animation.keyframes) || animation.keyframes.length === 0) {
    return sample;
  }

  const duration = animation.duration > 0 ? animation.duration : 1;
  // Modulo keeps a looping animation stable for arbitrarily large t.
  const local = ((t % duration) + duration) % duration;

  for (const [boneName, frames] of groupByBone(animation.keyframes)) {
    if (frames.length === 0) continue;

    if (local <= frames[0].time) {
      sample[boneName] = withDefaults(frames[0].transform);
      continue;
    }
    const last = frames[frames.length - 1];
    if (local >= last.time) {
      sample[boneName] = withDefaults(last.transform);
      continue;
    }

    let prev = frames[0];
    let next = last;
    for (let i = 0; i < frames.length - 1; i++) {
      if (local >= frames[i].time && local <= frames[i + 1].time) {
        prev = frames[i];
        next = frames[i + 1];
        break;
      }
    }

    const span = next.time - prev.time;
    // Coincident keyframes would divide by zero; snap to the later one.
    const ratio = span <= 0 ? 1 : (local - prev.time) / span;
    const a = withDefaults(prev.transform);
    const b = withDefaults(next.transform);

    sample[boneName] = {
      position: lerpTriple(a.position, b.position, ratio),
      rotation: lerpTriple(a.rotation, b.rotation, ratio),
      scale: lerpTriple(a.scale, b.scale, ratio),
    };
  }

  return sample;
}

function withDefaults(transform: KeyframeTransform | undefined): Required<KeyframeTransform> {
  return {
    position: transform?.position ?? IDENTITY.position,
    rotation: transform?.rotation ?? IDENTITY.rotation,
    scale: transform?.scale ?? IDENTITY.scale,
  };
}

/** Longest keyframe time, used when the author hasn't set a duration. */
export function inferDuration(keyframes: Keyframe[]): number {
  let max = 0;
  for (const kf of keyframes) if (kf && kf.time > max) max = kf.time;
  return max > 0 ? max : 1;
}

/**
 * Accept only well-formed animations off `properties.animations`, which is
 * user-supplied JSON and may be anything at all.
 */
export function parseAnimations(raw: unknown): CustomAnimation[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomAnimation[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof (item as any).name === 'string' ? (item as any).name.trim() : '';
    if (!name) continue;

    const rawFrames = Array.isArray((item as any).keyframes) ? (item as any).keyframes : [];
    const keyframes: Keyframe[] = [];
    for (const kf of rawFrames) {
      if (!kf || typeof kf !== 'object') continue;
      const time = Number((kf as any).time);
      const boneName = (kf as any).boneName;
      if (!Number.isFinite(time) || time < 0 || typeof boneName !== 'string' || !boneName) continue;
      keyframes.push({ time, boneName, transform: sanitizeTransform((kf as any).transform) });
    }
    if (keyframes.length === 0) continue;

    const declared = Number((item as any).duration);
    out.push({
      name,
      duration: Number.isFinite(declared) && declared > 0 ? declared : inferDuration(keyframes),
      keyframes,
    });
  }

  return out;
}

function sanitizeTransform(raw: unknown): KeyframeTransform {
  const t: KeyframeTransform = {};
  if (!raw || typeof raw !== 'object') return t;
  for (const key of ['position', 'rotation', 'scale'] as const) {
    const v = (raw as any)[key];
    if (Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)))) {
      t[key] = [Number(v[0]), Number(v[1]), Number(v[2])];
    }
  }
  return t;
}

/** Find an animation by name, case-insensitively (block fields are free text). */
export function findAnimation(
  animations: CustomAnimation[],
  name: string
): CustomAnimation | undefined {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return undefined;
  return animations.find((a) => a.name.trim().toLowerCase() === wanted);
}
