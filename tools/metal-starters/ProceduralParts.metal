#include <metal_stdlib>
using namespace metal;

// Primitive types. Keep in lockstep with StarterCatalog.swift StarterPrimitive
// raw values (0=ellipsoid, 1=cylinder, 2=cone). Every primitive uses the same
// (rings+1) x (segments+1) grid topology so triangle-index generation stays
// uniform in GLBWriter — only the per-vertex position + normal formula changes.
constant uint PRIMITIVE_ELLIPSOID = 0;
constant uint PRIMITIVE_CYLINDER  = 1;
constant uint PRIMITIVE_CONE      = 2;

// Fraction of the ring range devoted to the flat top/bottom cap disks on
// cylinders and cones. 0.12 gives caps enough vertex density to look flat
// under lighting without stealing too many rings from the side surface.
constant float CAP_FRACTION = 0.12f;

struct Part {
  packed_float3 center;
  packed_float3 radius;
  packed_float3 rotation;
  uint rings;
  uint segments;
  uint vertexOffset;
  uint primitiveType;
};

struct Vertex {
  packed_float3 position;
  packed_float3 normal;
};

float3 rotateX(float3 value, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return float3(value.x, value.y * c - value.z * s, value.y * s + value.z * c);
}

float3 rotateY(float3 value, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return float3(value.x * c + value.z * s, value.y, -value.x * s + value.z * c);
}

float3 rotateZ(float3 value, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return float3(value.x * c - value.y * s, value.x * s + value.y * c, value.z);
}

float3 rotateXYZ(float3 value, float3 rotation) {
  return rotateZ(rotateY(rotateX(value, rotation.x), rotation.y), rotation.z);
}

// Ellipsoid — sphere scaled per-axis. Original behaviour.
static void computeEllipsoid(uint ring, uint rings, float phi,
                             float3 radius,
                             thread float3 &position,
                             thread float3 &normal) {
  float theta = float(ring) / float(max(rings, 1u)) * M_PI_F;
  float poleSafeSin = sin(theta);
  if (ring == 0 || ring == rings) poleSafeSin = 0.0f;
  float3 spherePoint = float3(poleSafeSin * cos(phi), cos(theta), poleSafeSin * sin(phi));
  position = spherePoint * radius;
  float3 inverseRadius = 1.0f / max(abs(radius), float3(0.0001f));
  normal = spherePoint * inverseRadius;
}

// Cylinder — flat top disk + straight side + flat bottom disk, all sharing
// the (rings+1) x (segments+1) grid. `t` runs 0..1 over the ring axis and is
// partitioned into three zones by CAP_FRACTION.
static void computeCylinder(uint ring, uint rings, float phi,
                            float3 radius,
                            thread float3 &position,
                            thread float3 &normal) {
  float t = float(ring) / float(max(rings, 1u));
  float cp = cos(phi);
  float sp = sin(phi);

  if (t < CAP_FRACTION) {
    // Top cap disk: y = +radius.y, radial extent expands 0 → radius as ring
    // walks from the pole to the rim.
    float k = t / CAP_FRACTION;
    position = float3(cp * radius.x * k, radius.y, sp * radius.z * k);
    normal = float3(0, 1, 0);
  } else if (t > 1.0f - CAP_FRACTION) {
    // Bottom cap disk: y = -radius.y, radial extent shrinks radius → 0.
    float k = (1.0f - t) / CAP_FRACTION;
    position = float3(cp * radius.x * k, -radius.y, sp * radius.z * k);
    normal = float3(0, -1, 0);
  } else {
    // Straight side: y walks linearly from top-rim to bottom-rim, xz stays
    // on the rim ellipse. Normal is purely radial.
    float sideT = (t - CAP_FRACTION) / (1.0f - 2.0f * CAP_FRACTION);
    float y = radius.y - 2.0f * radius.y * sideT;
    position = float3(cp * radius.x, y, sp * radius.z);
    normal = normalize(float3(cp / max(radius.x, 0.0001f), 0, sp / max(radius.z, 0.0001f)));
  }
}

// Cone — pointy apex at +y, flat bottom cap disk at -y. Side tapers linearly
// from radius at the base to zero at the apex.
static void computeCone(uint ring, uint rings, float phi,
                        float3 radius,
                        thread float3 &position,
                        thread float3 &normal) {
  float t = float(ring) / float(max(rings, 1u));
  float cp = cos(phi);
  float sp = sin(phi);
  // Base-plane normal contribution for the slanted side (points outward AND
  // slightly upward). Height factor keeps taller cones from over-pointing up.
  float height = 2.0f * radius.y;
  float sideOutwardScale = height;
  float sideUpwardScale = 0.5f * (radius.x + radius.z);

  if (t < CAP_FRACTION) {
    // Apex zone — radius shrinks 0 as we approach the pole at t=0.
    float k = t / CAP_FRACTION;
    // Side surface interpolated from apex toward the base rim
    float sideT = k * CAP_FRACTION / (1.0f - CAP_FRACTION);  // 0 at pole
    float y = radius.y - 2.0f * radius.y * sideT;
    position = float3(cp * radius.x * sideT, y, sp * radius.z * sideT);
    normal = normalize(float3(cp * sideOutwardScale, sideUpwardScale, sp * sideOutwardScale));
  } else if (t > 1.0f - CAP_FRACTION) {
    // Bottom cap disk.
    float k = (1.0f - t) / CAP_FRACTION;
    position = float3(cp * radius.x * k, -radius.y, sp * radius.z * k);
    normal = float3(0, -1, 0);
  } else {
    // Side (linear taper). At t=CAP_FRACTION → radial ~= 0, at t=1-CAP_FRACTION → full radius.
    float sideT = (t - CAP_FRACTION) / (1.0f - 2.0f * CAP_FRACTION);
    float y = radius.y - 2.0f * radius.y * sideT;
    position = float3(cp * radius.x * sideT, y, sp * radius.z * sideT);
    normal = normalize(float3(cp * sideOutwardScale, sideUpwardScale, sp * sideOutwardScale));
  }
}

kernel void generateStarterVertices(
  device const Part *parts [[buffer(0)]],
  device Vertex *vertices [[buffer(1)]],
  constant uint &partCount [[buffer(2)]],
  uint id [[thread_position_in_grid]]) {
  uint owner = partCount;
  for (uint index = 0; index < partCount; ++index) {
    uint nextOffset = index + 1 < partCount
      ? parts[index + 1].vertexOffset
      : 0xffffffffu;
    if (id >= parts[index].vertexOffset && id < nextOffset) {
      owner = index;
      break;
    }
  }
  if (owner == partCount) return;

  Part part = parts[owner];
  uint localId = id - part.vertexOffset;
  uint columns = part.segments + 1;
  uint ring = localId / columns;
  uint segment = localId % columns;
  if (ring > part.rings) return;

  float phi = float(segment) / float(max(part.segments, 1u)) * (2.0f * M_PI_F);
  float3 radius = float3(part.radius);
  float3 rotation = float3(part.rotation);
  float3 center = float3(part.center);

  float3 localPosition;
  float3 localNormal;
  switch (part.primitiveType) {
    case PRIMITIVE_ELLIPSOID:
      computeEllipsoid(ring, part.rings, phi, radius, localPosition, localNormal);
      break;
    case PRIMITIVE_CYLINDER:
      computeCylinder(ring, part.rings, phi, radius, localPosition, localNormal);
      break;
    case PRIMITIVE_CONE:
      computeCone(ring, part.rings, phi, radius, localPosition, localNormal);
      break;
    default:
      // Unknown primitiveType — fall back to ellipsoid so a stale ABI mismatch
      // still produces geometry instead of leaving the vertex uninitialized.
      computeEllipsoid(ring, part.rings, phi, radius, localPosition, localNormal);
      break;
  }

  float3 position = rotateXYZ(localPosition, rotation) + center;
  float3 rotatedNormal = rotateXYZ(localNormal, rotation);
  float normalLength = max(length(rotatedNormal), 0.0001f);

  vertices[id].position = packed_float3(position);
  vertices[id].normal = packed_float3(rotatedNormal / normalLength);
}
