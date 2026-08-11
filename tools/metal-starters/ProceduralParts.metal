#include <metal_stdlib>
using namespace metal;

struct Part {
  packed_float3 center;
  packed_float3 radius;
  packed_float3 rotation;
  uint rings;
  uint segments;
  uint vertexOffset;
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

  float theta = float(ring) / float(max(part.rings, 1u)) * M_PI_F;
  float phi = float(segment) / float(max(part.segments, 1u)) * (2.0f * M_PI_F);
  float poleSafeSin = sin(theta);
  if (ring == 0 || ring == part.rings) poleSafeSin = 0.0f;
  float3 spherePoint = float3(poleSafeSin * cos(phi), cos(theta), poleSafeSin * sin(phi));
  float3 radius = float3(part.radius);
  float3 rotation = float3(part.rotation);
  float3 center = float3(part.center);
  float3 position = rotateXYZ(spherePoint * radius, rotation) + center;
  float3 inverseRadius = 1.0f / max(abs(radius), float3(0.0001f));
  float3 normalBeforeRotation = spherePoint * inverseRadius;
  float3 rotatedNormal = rotateXYZ(normalBeforeRotation, rotation);
  float normalLength = max(length(rotatedNormal), 0.0001f);

  vertices[id].position = packed_float3(position);
  vertices[id].normal = packed_float3(rotatedNormal / normalLength);
}
