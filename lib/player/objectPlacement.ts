/**
 * Where an authored object sits in the player's world.
 *
 * Two coordinate conventions coexist: legacy editor pixels (500,300 is the
 * centre, divided by 100) and modern authored 3D coordinates for template
 * worlds. `legacyGround` picks between them; see templateCoordinatePolicy.
 * Pure functions, no React or THREE, so node tests can require them.
 */

import type { GameObject } from '../../types/game';
import { platformTopSurface, toPlayerPosition, type PlatformSurface } from './platformerWorld';

export function isPlatformObject(object: GameObject) {
  const properties = typeof object.properties === 'string' ? safeParseProperties(object.properties) : object.properties ?? {};
  return object.type === 'platform' || properties.shape === 'plane';
}

export function safeParseProperties(raw: string) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

export function designPosition(object: GameObject): [number, number, number] {
  return [
    Number(object.position_x ?? 0),
    Number(object.position_y ?? 0),
    Number(object.position_z ?? 0),
  ];
}

export function legacyPlayerPosition(object: GameObject): [number, number, number] {
  const [x, y, z] = designPosition(object);
  const legacyX = x === 0 ? 500 : x;
  const legacyY = y === 0 ? 300 : y;
  return [(legacyX / 100) - 5, -(legacyY / 100) + 3, z];
}

export function playerPositionForObject(object: GameObject, legacyGround: boolean): [number, number, number] {
  if (!legacyGround) {
    const point = toPlayerPosition(designPosition(object), { legacyGround: false });
    return [point.x, point.y, point.z];
  }

  const legacyPosition = legacyPlayerPosition(object);
  if (!isPlatformObject(object)) return legacyPosition;
  const point = toPlayerPosition(legacyPosition, { legacyGround: true });
  return [point.x, point.y, point.z];
}

export function platformSurfaceForObject(object: GameObject, legacyGround: boolean): PlatformSurface | null {
  if (!isPlatformObject(object)) return null;
  return platformTopSurface({
    id: object.id,
    type: object.type,
    position: legacyGround ? legacyPlayerPosition(object) : designPosition(object),
    properties: object.properties,
  }, { legacyGround });
}
