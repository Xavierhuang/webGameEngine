/**
 * Shared coordinates and collision primitives for the platformer runtime.
 *
 * This module deliberately has no rendering, React, or persistence imports so
 * authored world coordinates and gameplay collision math cannot drift apart.
 */

export const LEGACY_GROUND_Y = -2;
/** Alias retained for callers that use the existing physics constant name. */
export const GROUND_Y = LEGACY_GROUND_Y;
/** One explicit design-unit to player-world-unit conversion. */
export const PLAYER_WORLD_SCALE = 1;

export interface PlayerPoint {
  x: number;
  y: number;
  z: number;
}

export interface PlatformSurface {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

export type PlatformSize =
  | number
  | [number, number, number]
  | {
      width?: number;
      height?: number;
      depth?: number;
      value?: number;
    };

export interface PlatformObject {
  id?: string;
  type?: string;
  shape?: string;
  position: [number, number, number];
  size?: PlatformSize;
  scale?: PlatformSize;
  properties?: PlatformProperties | string;
}

export interface PlatformProperties {
  shape?: string;
  size?: PlatformSize;
  [key: string]: unknown;
}

export interface PlayerPositionOptions {
  legacyGround: boolean;
}

/** Convert one persisted design position into player-world coordinates. */
export function toPlayerPosition(
  position: [number, number, number],
  options: PlayerPositionOptions,
): PlayerPoint {
  const [x, y, z] = position;
  return {
    x: x * PLAYER_WORLD_SCALE,
    y: options.legacyGround ? LEGACY_GROUND_Y : y * PLAYER_WORLD_SCALE,
    z: z * PLAYER_WORLD_SCALE,
  };
}

const RENDERER_PIXELS_PER_WORLD_UNIT = 100;
const DEFAULT_PLATFORM_WIDTH_PX = 1000;
const DEFAULT_PLATFORM_HEIGHT_PX = 50;

function authoredDimensions(candidate: PlatformSize): { width: number; depth: number } {

  if (typeof candidate === 'number') {
    return { width: candidate, depth: candidate };
  }

  if (Array.isArray(candidate)) {
    return {
      width: candidate[0] ?? 1,
      // Platforms are rendered as planes rotated onto the XZ floor: the
      // renderer's scaleY is therefore their world-space Z/depth dimension.
      depth: candidate[1] ?? candidate[2] ?? candidate[0] ?? 1,
    };
  }

  const fallback = candidate.value ?? 1;
  const width = candidate.width ?? fallback;
  return { width, depth: candidate.height ?? candidate.depth ?? width };
}

function readProperties(object: PlatformObject): PlatformProperties {
  if (typeof object.properties !== 'string') return object.properties ?? {};
  try {
    const parsed: unknown = JSON.parse(object.properties);
    return parsed && typeof parsed === 'object' ? parsed as PlatformProperties : {};
  } catch {
    return {};
  }
}

function persistedDimensions(size: PlatformSize | undefined): { width: number; depth: number } {
  // GamePlayer reads platform properties.size as pixel dimensions and scales
  // the plane by width/100 on X and height/100 on its rotated Z axis.
  if (!size || typeof size !== 'object' || Array.isArray(size)) {
    return {
      width: DEFAULT_PLATFORM_WIDTH_PX / RENDERER_PIXELS_PER_WORLD_UNIT,
      depth: DEFAULT_PLATFORM_HEIGHT_PX / RENDERER_PIXELS_PER_WORLD_UNIT,
    };
  }

  const widthPx = size.width ?? DEFAULT_PLATFORM_WIDTH_PX;
  const heightPx = size.height ?? DEFAULT_PLATFORM_HEIGHT_PX;
  return {
    width: widthPx / RENDERER_PIXELS_PER_WORLD_UNIT,
    depth: heightPx / RENDERER_PIXELS_PER_WORLD_UNIT,
  };
}

function platformDimensions(object: PlatformObject): { width: number; depth: number } {
  // Direct size/scale values are already authored world units. Persisted
  // database objects use properties.size in renderer pixels instead.
  if (object.size !== undefined) return authoredDimensions(object.size);
  if (object.scale !== undefined) return authoredDimensions(object.scale);
  return persistedDimensions(readProperties(object).size);
}

/** Derive a top surface for a platform object, or null for other object types. */
export function platformTopSurface(
  object: PlatformObject,
  options: PlayerPositionOptions,
): PlatformSurface | null {
  const properties = readProperties(object);
  if (object.type !== 'platform' && object.shape !== 'plane' && properties.shape !== 'plane') {
    return null;
  }

  const point = toPlayerPosition(object.position, options);
  const { width, depth } = platformDimensions(object);
  const halfWidth = (width * PLAYER_WORLD_SCALE) / 2;
  const halfDepth = (depth * PLAYER_WORLD_SCALE) / 2;

  return {
    id: object.id ?? 'platform',
    minX: point.x - halfWidth,
    maxX: point.x + halfWidth,
    minZ: point.z - halfDepth,
    maxZ: point.z + halfDepth,
    topY: point.y,
  };
}

/**
 * Find the highest platform crossed while descending through this frame.
 * Horizontal overlap includes the character's circular footprint radius.
 */
export function findLandingSurface(
  character: { x: number; z: number; radius: number },
  previousY: number,
  nextY: number,
  surfaces: PlatformSurface[],
): PlatformSurface | null {
  if (previousY <= nextY) return null;

  const radius = Math.max(0, character.radius);
  const crossed = surfaces.filter((surface) => {
    const crossedTop = previousY >= surface.topY && nextY <= surface.topY;
    const overlapsX = character.x + radius >= surface.minX && character.x - radius <= surface.maxX;
    const overlapsZ = character.z + radius >= surface.minZ && character.z - radius <= surface.maxZ;
    return crossedTop && overlapsX && overlapsZ;
  });

  return crossed.reduce<PlatformSurface | null>(
    (highest, surface) => (highest === null || surface.topY > highest.topY ? surface : highest),
    null,
  );
}

/** Return whether two world points are within the supplied inclusive radius. */
export function touchesSphere(a: PlayerPoint, b: PlayerPoint, radius: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const distanceSquared = dx * dx + dy * dy + dz * dz;
  return distanceSquared <= radius * radius;
}
