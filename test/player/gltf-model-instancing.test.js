'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const player = fs.readFileSync(path.join(root, 'components/player/GamePlayer.tsx'), 'utf8');
const gltfStart = player.indexOf('function GLTFExtModel');
const gltfEnd = player.indexOf('function OBJExtModel', gltfStart);

assert.ok(gltfStart >= 0 && gltfEnd > gltfStart, 'GLTFExtModel must remain a distinct loader component');
const gltfModel = player.slice(gltfStart, gltfEnd);

assert.match(
  player,
  /import \* as SkeletonUtils from 'three\/examples\/jsm\/utils\/SkeletonUtils\.js';/,
  'runtime GLB instances need Three.js clone support',
);
assert.match(
  gltfModel,
  /const instance = useMemo\(\(\) => SkeletonUtils\.clone\(gltf\.scene\), \[gltf\.scene\]\);/,
  'each GLB renderer must own a clone of the cached loader scene',
);
assert.match(
  gltfModel,
  /<primitive ref=\{meshRef\} object=\{instance\}/,
  'the runtime collider must follow the per-object GLB instance',
);
assert.doesNotMatch(
  gltfModel,
  /object=\{gltf\.scene\}/,
  'a cached GLB scene cannot be mounted directly for multiple collectibles',
);

console.log('GLTF runtime model instancing test passed');
