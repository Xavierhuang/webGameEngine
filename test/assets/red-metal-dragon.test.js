const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const assetPath = 'public/models/red-metal-dragon.glb';

const accessorTypes = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

const componentTypes = {
  5120: { byteLength: 1, read: (file, offset) => file.readInt8(offset) },
  5121: { byteLength: 1, read: (file, offset) => file.readUInt8(offset) },
  5122: { byteLength: 2, read: (file, offset) => file.readInt16LE(offset) },
  5123: { byteLength: 2, read: (file, offset) => file.readUInt16LE(offset) },
  5125: { byteLength: 4, read: (file, offset) => file.readUInt32LE(offset) },
  5126: { byteLength: 4, read: (file, offset) => file.readFloatLE(offset) },
};

function readGlb(path) {
  const file = fs.readFileSync(path);
  assert.equal(file.toString('utf8', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  const jsonLength = file.readUInt32LE(12);
  assert.equal(file.toString('utf8', 16, 20), 'JSON');
  const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength).trim());
  const binHeader = 20 + jsonLength;
  assert.equal(file.toString('utf8', binHeader + 4, binHeader + 8), 'BIN\0');
  return { file, json, binOffset: binHeader + 8 };
}

function readAccessorElement(glb, accessorIndex, elementIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const component = componentTypes[accessor.componentType];
  const componentCount = accessorTypes[accessor.type];
  assert.ok(component, `unsupported component type ${accessor.componentType}`);
  assert.ok(componentCount, `unsupported accessor type ${accessor.type}`);
  assert.ok(elementIndex >= 0 && elementIndex < accessor.count, `accessor element ${elementIndex} is out of range`);

  const byteStride = view.byteStride || componentCount * component.byteLength;
  const elementOffset = glb.binOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0)
    + elementIndex * byteStride;
  return Array.from({ length: componentCount }, (_, componentIndex) => (
    component.read(glb.file, elementOffset + componentIndex * component.byteLength)
  ));
}

test('accessor reader honors interleaved stride and accessor offsets', () => {
  const file = Buffer.alloc(64);
  [1, 2, 3].forEach((value, index) => file.writeFloatLE(value, 4 + index * 4));
  [4, 5, 6].forEach((value, index) => file.writeFloatLE(value, 16 + index * 4));
  [7, 8, 9].forEach((value, index) => file.writeFloatLE(value, 40 + index * 4));
  const glb = {
    file,
    binOffset: 0,
    json: {
      accessors: [{ bufferView: 0, byteOffset: 12, componentType: 5126, count: 2, type: 'VEC3' }],
      bufferViews: [{ byteOffset: 4, byteLength: 48, byteStride: 24 }],
    },
  };

  assert.deepEqual(readAccessorElement(glb, 0, 0), [4, 5, 6]);
  assert.deepEqual(readAccessorElement(glb, 0, 1), [7, 8, 9]);
});

test('Metal-generated dragon has the required anatomy and materials', () => {
  const { json } = readGlb(assetPath);
  const names = new Set(json.nodes.map((node) => node.name));
  for (const name of ['Torso', 'Neck', 'Head', 'Snout', 'HornLeft', 'HornRight',
    'WingLeft', 'WingRight', 'LegFrontLeft', 'LegFrontRight',
    'LegBackLeft', 'LegBackRight']) assert.ok(names.has(name), name);
  assert.deepEqual(json.materials.map((m) => m.name),
    ['Dragon Red Metal', 'Dark Horn', 'Dark Wing']);
});

test('all POSITION and NORMAL floats are finite', () => {
  const glb = readGlb(assetPath);
  for (const mesh of glb.json.meshes) for (const primitive of mesh.primitives) {
    for (const semantic of ['POSITION', 'NORMAL']) {
      const accessorIndex = primitive.attributes[semantic];
      const accessor = glb.json.accessors[accessorIndex];
      assert.equal(accessor.componentType, 5126, `${semantic} must use FLOAT components`);
      assert.equal(accessor.type, 'VEC3', `${semantic} must be VEC3`);
      for (let index = 0; index < accessor.count; index += 1) {
        for (const value of readAccessorElement(glb, accessorIndex, index)) {
          assert.ok(Number.isFinite(value), `${semantic}[${index}]`);
        }
      }
    }
  }
});

test('every nondegenerate triangle is wound outward relative to its vertex normals', () => {
  const glb = readGlb(assetPath);
  let nondegenerateTriangleCount = 0;

  for (const mesh of glb.json.meshes) for (const primitive of mesh.primitives) {
    const positionAccessorIndex = primitive.attributes.POSITION;
    const normalAccessorIndex = primitive.attributes.NORMAL;
    const indexAccessor = glb.json.accessors[primitive.indices];
    assert.equal(indexAccessor.type, 'SCALAR');
    assert.ok([5121, 5123, 5125].includes(indexAccessor.componentType),
      `unsupported index component type ${indexAccessor.componentType}`);
    assert.equal(indexAccessor.count % 3, 0);

    for (let triangle = 0; triangle < indexAccessor.count; triangle += 3) {
      const indices = [0, 1, 2].map((offset) => readAccessorElement(glb, primitive.indices, triangle + offset)[0]);
      const positions = indices.map((index) => readAccessorElement(glb, positionAccessorIndex, index));
      const normals = indices.map((index) => readAccessorElement(glb, normalAccessorIndex, index));
      const edgeA = positions[1].map((value, axis) => value - positions[0][axis]);
      const edgeB = positions[2].map((value, axis) => value - positions[0][axis]);
      const geometricNormal = [
        edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
        edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
        edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0],
      ];
      const geometricLengthSquared = geometricNormal.reduce((sum, value) => sum + value * value, 0);
      if (geometricLengthSquared <= 1e-12) continue;

      nondegenerateTriangleCount += 1;
      const averageNormal = [0, 1, 2].map((axis) => (
        (normals[0][axis] + normals[1][axis] + normals[2][axis]) / 3
      ));
      const orientation = geometricNormal.reduce((sum, value, axis) => sum + value * averageNormal[axis], 0);
      assert.ok(orientation > 0, `${mesh.name} triangle ${triangle / 3} has inward winding (${orientation})`);
    }
  }

  assert.ok(nondegenerateTriangleCount > 0);
});
