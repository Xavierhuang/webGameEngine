export type PresentationAnimationState = 'idle' | 'walk' | 'jump' | 'fall';

export interface PresentationTransform {
  /** A render-only local Y offset; never a gameplay/collider position. */
  positionY: number;
  /** A render-only local Z rotation in radians. */
  rotationZ: number;
  /** A render-only local Y scale. */
  scaleY: number;
}

const IDENTITY: PresentationTransform = { positionY: 0, rotationZ: 0, scaleY: 1 };

/**
 * Small procedural fallback transforms for models without an authored clip.
 * The helper is deliberately pure: callers apply this result to a visual
 * child, while physics continues to use its unmodified source position.
 */
export function proceduralMotion(
  state: PresentationAnimationState,
  time: number,
  reducedMotion: boolean,
): PresentationTransform {
  if (reducedMotion) return { ...IDENTITY };

  const t = Number.isFinite(time) ? time : 0;
  switch (state) {
    case 'idle':
      return {
        positionY: 0.03 * Math.sin(t * 2),
        rotationZ: 0.015 * Math.sin(t * 1.5),
        scaleY: 1 + 0.01 * Math.sin(t * 2),
      };
    case 'walk':
      return {
        positionY: 0.045 * Math.abs(Math.sin(t * 8)),
        rotationZ: 0.08 * Math.sin(t * 8),
        scaleY: 1 + 0.025 * Math.sin(t * 16),
      };
    case 'jump':
      return {
        positionY: 0.08 * Math.sin(t * 4),
        rotationZ: 0.04 * Math.sin(t * 3),
        scaleY: 1.03 + 0.03 * Math.sin(t * 4),
      };
    case 'fall':
      return {
        positionY: -0.02 * Math.abs(Math.sin(t * 3)),
        rotationZ: 0.12 * Math.sin(t * 2),
        scaleY: 0.96 + 0.02 * Math.sin(t * 3),
      };
    default:
      return { ...IDENTITY };
  }
}
