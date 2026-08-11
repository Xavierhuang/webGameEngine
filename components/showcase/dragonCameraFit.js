function calculateDragonFitDistance({
  aspect,
  verticalFovDegrees,
  halfExtents,
  margin,
}) {
  const verticalHalfFovTangent = Math.tan(verticalFovDegrees * Math.PI / 360);
  const horizontalHalfFovTangent = verticalHalfFovTangent * aspect;
  const rotatingHorizontalHalfExtent = Math.hypot(halfExtents.width, halfExtents.depth);
  return Math.max(
    (rotatingHorizontalHalfExtent + margin) / horizontalHalfFovTangent,
    (halfExtents.height + margin) / verticalHalfFovTangent,
  );
}

module.exports = { calculateDragonFitDistance };
