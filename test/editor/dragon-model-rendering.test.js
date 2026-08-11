const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const selector = fs.readFileSync('components/editor/CharacterSelector.tsx', 'utf8');
const preview = fs.readFileSync('components/editor/ShapePreview.tsx', 'utf8');
const animated = fs.readFileSync('components/editor/AnimatedModel.tsx', 'utf8');

test('dragon tile passes the local model into the preview', () => {
  assert.match(selector, /modelUrl=\{c\.model_url\}/);
  assert.match(preview, /useGLTF\(modelUrl\)/);
});

test('preview and runtime clone cached GLTF scenes', () => {
  assert.match(preview, /SkeletonUtils\.clone/);
  assert.match(animated, /SkeletonUtils\.clone/);
  assert.doesNotMatch(animated, /<primitive object=\{scene\}/);
});
