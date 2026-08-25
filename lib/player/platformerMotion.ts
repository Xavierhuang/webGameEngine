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

/**
 * Convert a horizontal movement vector into the yaw for Lingplay's starter
 * characters, which face local positive Z. No movement keeps the last direction so a player
 * character does not snap back to its spawn orientation after each key press.
 */
export function facingYawForMovement(moveX: number, moveZ: number, previousYaw = 0): number {
  const x = Number.isFinite(moveX) ? moveX : 0;
  const z = Number.isFinite(moveZ) ? moveZ : 0;
  if (Math.hypot(x, z) < 0.0001) return Number.isFinite(previousYaw) ? previousYaw : 0;

  const yaw = Math.atan2(x, z);
  if (Object.is(yaw, -0)) return 0;
  return yaw === -Math.PI ? Math.PI : yaw;
}

export interface MotionState {
  position: PlayerPoint;
  velocity: PlayerPoint;
  radius: number;
  grounded: boolean;
  groundedSurfaceId?: string;
}

export interface PlatformerMotionOptions {
  /** Older worlds use one fixed floor; platformer v2 worlds use surfaces only. */
  legacyGround?: boolean;
}

function supportingSurface(state: MotionState, surfaces: PlatformSurface[]): PlatformSurface | null {
  const radius = Math.max(0, state.radius);
  const supported = surfaces.filter((surface) => (
    Math.abs(state.position.y - surface.topY) <= PHYSICS.GROUND_TOLERANCE
    && state.position.x + radius >= surface.minX
    && state.position.x - radius <= surface.maxX
    && state.position.z + radius >= surface.minZ
    && state.position.z - radius <= surface.maxZ
 ));

  return supported.reduce<PlatformSurface | null>(
    (highest, surface) => (highest === null || surface.topY > highest.topY ? surface : highest),
    null,
  );
}

/**
 * Advance only vertical platformer motion. Horizontal movement stays owned by
 * the player runtime, preserving its existing keyboard and script behavior.
 */
export function advancePlatformerMotion(
  state: MotionState,
  delta: number,
  surfaces: PlatformSurface[],
  options: PlatformerMotionOptions = {},
): MotionState {
  const legacyGround = options.legacyGround ?? true;
  const groundedSurface = state.grounded ? supportingSurface(state, surfaces) : null;

  // A grounded player is supported only when they still overlap a platform.
  // Resolve this from position rather than trusting an optional prior id so a
  // character spawned directly on a platform gets its support on frame one.
  if (groundedSurface) {
    return {
      ...state,
      position: { ...state.position },
      velocity: { ...state.velocity },
      groundedSurfaceId: groundedSurface.id,
    };
  }

  // Older scenes intentionally use a fixed floor. Platformer v2 has no such
  // floor: once the player leaves every authored platform, gravity continues.
  if (state.grounded && legacyGround && state.position.y <= LEGACY_GROUND_Y + PHYSICS.GROUND_TOLERANCE) {
    return {
      ...state,
      position: { ...state.position, y: LEGACY_GROUND_Y },
      velocity: { ...state.velocity, y: 0 },
      groundedSurfaceId: undefined,
    };
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

  if (legacyGround && nextY <= LEGACY_GROUND_Y + PHYSICS.GROUND_TOLERANCE) {
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
