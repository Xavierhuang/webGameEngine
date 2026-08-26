const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getModelExtension,
  isTrustedAssetUrl,
  isTrustedModelUrl,
  validateUploadedModelBytes,
} = require('../.build/lib/models/modelPolicy.js');

const bytes = (value) => new TextEncoder().encode(value);

test('model URLs are limited to local model paths and approved AI assets', () => {
  assert.equal(isTrustedModelUrl('/models/minion/FBX/Minion_FBX.fbx'), true);
  assert.equal(isTrustedModelUrl('/uploads/models/my-hero.glb'), true);
  assert.equal(isTrustedModelUrl('https://assets.meshy.ai/models/hero.glb?signature=abc'), true);

  assert.equal(isTrustedModelUrl('https://untrusted.example/hero.glb'), false);
  assert.equal(isTrustedModelUrl('http://assets.meshy.ai/models/hero.glb'), false);
  assert.equal(isTrustedModelUrl('//untrusted.example/hero.glb'), false);
  assert.equal(isTrustedModelUrl('javascript:alert(1)'), false);
  assert.equal(isTrustedModelUrl('/models/../uploads/models/hero.glb'), false);
  assert.equal(isTrustedModelUrl(`/models/${'a'.repeat(2_050)}.glb`), false);
  assert.equal(isTrustedModelUrl('/uploads/models/not-a-model.txt'), false);
});

test('asset URLs use one shared allowlist for packaged and uploaded media', () => {
  assert.equal(isTrustedAssetUrl('/models/minion/FBX/Minion_FBX.fbx'), true);
  assert.equal(isTrustedAssetUrl('/backdrops/blue-sky.svg'), true);
  assert.equal(isTrustedAssetUrl('/uploads/textures/drawing.png'), true);
  assert.equal(isTrustedAssetUrl('/uploads/audio/recording.webm'), true);
  assert.equal(isTrustedAssetUrl('https://assets.meshy.ai/models/hero.glb'), true);

  assert.equal(isTrustedAssetUrl('https://untrusted.example/texture.png'), false);
  assert.equal(isTrustedAssetUrl('/uploads/audio/recording.exe'), false);
  assert.equal(isTrustedAssetUrl('/backdrops/../private.png'), false);
});

test('model extension parsing ignores query strings and normalizes case', () => {
  assert.equal(getModelExtension('/models/Hero.GLB?cache=1'), 'glb');
  assert.equal(getModelExtension('https://assets.meshy.ai/hero.fbx#preview'), 'fbx');
  assert.equal(getModelExtension('/uploads/models/hero.txt'), null);
});

test('uploaded files must match the format claimed by their extension', () => {
  assert.equal(validateUploadedModelBytes('glb', Uint8Array.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0])).valid, true);
  assert.equal(validateUploadedModelBytes('gltf', bytes('{"asset":{"version":"2.0"}}')).valid, true);
  assert.equal(validateUploadedModelBytes('fbx', bytes('Kaydara FBX Binary  \0')).valid, true);
  assert.equal(validateUploadedModelBytes('obj', bytes('# hero\nv 0 0 0\nf 1 1 1')).valid, true);
  assert.equal(validateUploadedModelBytes('stl', bytes('solid hero\nfacet normal 0 0 1\nendsolid hero')).valid, true);
  assert.equal(validateUploadedModelBytes('dae', bytes('<?xml version="1.0"?><COLLADA></COLLADA>')).valid, true);

  const invalid = validateUploadedModelBytes('glb', bytes('<html>not a model</html>'));
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /does not match/i);
});
