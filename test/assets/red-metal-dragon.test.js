const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const assetPath = 'public/models/red-metal-dragon.glb';

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
  const { file, json, binOffset } = readGlb(assetPath);
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    for (const semantic of ['POSITION', 'NORMAL']) {
      const accessor = json.accessors[primitive.attributes[semantic]];
      const view = json.bufferViews[accessor.bufferView];
      for (let index = 0; index < accessor.count * 3; index += 1) {
        const value = file.readFloatLE(binOffset + (view.byteOffset || 0) + index * 4);
        assert.ok(Number.isFinite(value), `${semantic}[${index}]`);
      }
    }
  }
});
