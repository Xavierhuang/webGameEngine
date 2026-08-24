import { PHYSICS } from '../constants/game';
import {
  LEGACY_GROUND_Y,
  findLandingSurface,
  type PlatformSurface,
  type PlayerPoint,
} from './platformerWorld';

/** Re-exported so gameplay contracts measure the same motion constants. */
export const GRAVITY = PHYSICS.GRAVITY;
export const JUMP_FORCE = PHYSICS.JUMP_FORCE;

export interface MotionState {
  position: PlayerPoint;
  velocity: PlayerPoint;
  radius: number;
  grounded: boolean;
  groundedSurfaceId?: string;
}

/**
 * Advance only vertical platformer motion. Horizontal movement stays owned by
 * the player runtime, preserving its existing keyboard and script behavior.
 */
export function advancePlatformerMotion(
  state: MotionState,
  delta: number,
  surfaces: PlatformSurface[],
): MotionState {
  const groundedSurface = state.groundedSurfaceId
    ? surfaces.find((surface) => surface.id === state.groundedSurfaceId)
    : undefined;
  const stillOnGroundedSurface = groundedSurface
    && state.position.x + Math.max(0, state.radius) >= groundedSurface.minX
    && state.position.x - Math.max(0, state.radius) <= groundedSurface.maxX
    && state.position.z + Math.max(0, state.radius) >= groundedSurface.minZ
    && state.position.z - Math.max(0, state.radius) <= groundedSurface.maxZ;

  // Fixed legacy ground has no surface id and remains grounded. A raised
  // platform does not: crossing its horizontal edge resumes gravity.
  if (state.grounded && (!groundedSurface || stillOnGroundedSurface)) {
    return { ...state, position: { ...state.position }, velocity: { ...state.velocity } };
  }

  const velocityY = Math.max(
    -PHYSICS.TERMINAL_VELOCITY,
    state.velocity.y - GRAVITY * delta,
  );
  const nextY = state.position.y + velocityY * delta;
  const landing = findLandingSurface(
    { x: state.position.x, z: state.position.z, radius: state.radius },
    state.position.y,
    nextY,
    surfaces,
  );

  if (landing) {
    return {
      ...state,
      position: { ...state.position, y: landing.topY },
      velocity: { ...state.velocity, y: 0 },
      grounded: true,
      groundedSurfaceId: landing.id,
    };
  }

  if (nextY <= LEGACY_GROUND_Y + PHYSICS.GROUND_TOLERANCE) {
    return {
      ...state,
      position: { ...state.position, y: LEGACY_GROUND_Y },
      velocity: { ...state.velocity, y: 0 },
      grounded: true,
      groundedSurfaceId: undefined,
    };
  }

  return {
    ...state,
    position: { ...state.position, y: nextY },
    velocity: { ...state.velocity, y: velocityY },
    grounded: false,
    groundedSurfaceId: undefined,
  };
}

/** Start a jump only from a surface that has already established grounding. */
export function requestPlatformerJump(state: MotionState): MotionState {
  if (!state.grounded) return state;
  return {
    ...state,
    position: { ...state.position },
    velocity: { ...state.velocity, y: JUMP_FORCE },
    grounded: false,
    groundedSurfaceId: undefined,
  };
}
