export interface ModelVector3 {
  x: number;
  y: number;
  z: number;
}

export interface ModelBounds {
  min: ModelVector3;
  max: ModelVector3;
}

export type ModelOriginOffset = ModelVector3;

export interface ModelRenderContract {
  outerScale: [number, number, number];
  innerScale: [1, 1, 1];
  innerPosition: [number, number, number];
  visibleWidth: number;
  scaledMinimumY: number | null;
  touchRadius: number;
}

export interface ActiveModelMetadataInput {
  shape?: string;
  baseModelUrl?: string;
  modelUrl?: string;
  baseBounds?: unknown;
  baseOriginOffset?: unknown;
  activeBounds?: unknown;
  activeOriginOffset?: unknown;
}

export interface ActiveModelMetadata {
  bounds?: unknown;
  originOffset?: unknown;
}

function isFiniteVector(value: unknown): value is ModelVector3 {
  if (!value || typeof value !== 'object') return false;
  const vector = value as Partial<ModelVector3>;
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

export function isModelBounds(value: unknown): value is ModelBounds {
  if (!value || typeof value !== 'object') return false;
  const bounds = value as Partial<ModelBounds>;
  return isFiniteVector(bounds.min) && isFiniteVector(bounds.max)
    && bounds.max.x >= bounds.min.x
    && bounds.max.y >= bounds.min.y
    && bounds.max.z >= bounds.min.z;
}

export function isModelOriginOffset(value: unknown): value is ModelOriginOffset {
  return isFiniteVector(value);
}

/**
 * Selects metadata for the active appearance. Base-model measurements must not
 * leak into a costume that renders another model (or a primitive shape).
 */
export function resolveActiveModelMetadata({
  shape,
  baseModelUrl,
  modelUrl,
  baseBounds,
  baseOriginOffset,
  activeBounds,
  activeOriginOffset,
}: ActiveModelMetadataInput): ActiveModelMetadata {
  if (shape !== 'model') return {};

  const rendersBaseModel = modelUrl === baseModelUrl;
  if (!rendersBaseModel) {
    return {
      ...(activeBounds !== undefined ? { bounds: activeBounds } : {}),
      ...(activeOriginOffset !== undefined ? { originOffset: activeOriginOffset } : {}),
    };
  }

  const bounds = activeBounds ?? baseBounds;
  const originOffset = activeOriginOffset ?? baseOriginOffset;
  return {
    ...(bounds !== undefined ? { bounds } : {}),
    ...(originOffset !== undefined ? { originOffset } : {}),
  };
}

/**
 * Resolves the transform and measurements shared by editor and player model
 * renderers. The outer group owns scale; AnimatedModel stays at unit scale.
 */
export function createModelRenderContract(
  requestedScale: number,
  candidateBounds?: unknown,
  candidateOriginOffset?: unknown
): ModelRenderContract {
  const scale = Number.isFinite(requestedScale) && requestedScale >= 0
    ? requestedScale
    : 1;
  const bounds = isModelBounds(candidateBounds) ? candidateBounds : null;
  const originOffset = isModelOriginOffset(candidateOriginOffset)
    ? candidateOriginOffset
    : { x: 0, y: 0, z: 0 };
  const horizontalHalfExtent = bounds
    ? Math.max(
      (bounds.max.x - bounds.min.x) / 2,
      (bounds.max.z - bounds.min.z) / 2
    )
    : 0.5;

  return {
    outerScale: [scale, scale, scale],
    innerScale: [1, 1, 1],
    innerPosition: [originOffset.x, originOffset.y, originOffset.z],
    visibleWidth: bounds ? (bounds.max.x - bounds.min.x) * scale : scale,
    scaledMinimumY: bounds
      ? (bounds.min.y + originOffset.y) * scale
      : null,
    touchRadius: horizontalHalfExtent * scale,
  };
}
