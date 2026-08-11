export interface DragonHalfExtents {
  width: number;
  height: number;
  depth: number;
}

export interface DragonFitOptions {
  aspect: number;
  verticalFovDegrees: number;
  halfExtents: DragonHalfExtents;
  margin: number;
}

export function calculateDragonFitDistance(options: DragonFitOptions): number;
