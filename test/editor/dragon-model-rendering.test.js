const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const selector = fs.readFileSync('components/editor/CharacterSelector.tsx', 'utf8');
const preview = fs.readFileSync('components/editor/ShapePreview.tsx', 'utf8');
const animated = fs.readFileSync('components/editor/AnimatedModel.tsx', 'utf8');
const editorScene = fs.readFileSync('components/editor/SceneView.tsx', 'utf8');
const player = fs.readFileSync('components/player/GamePlayer.tsx', 'utf8');

test('CharacterSelector source passes starter model URLs into ShapePreview', () => {
  assert.match(selector, /modelUrl=\{c\.model_url\}/);
  assert.match(preview, /useGLTF\(modelUrl\)/);
});

test('CharacterSelector source keeps the exact compound dragon prompt placeholder', () => {
  assert.match(selector, /placeholder="A red dragon warrior with a big sword"/);
});

test('ShapePreview source clones the cached GLTF scene for a preview instance', () => {
  assert.match(preview, /SkeletonUtils\.clone/);
});

test('AnimatedModel source delegates GLTF timing to Drei and retains FBX frame updates', () => {
  const gltfSection = animated.slice(
    animated.indexOf('function GLTFAnimatedModel'),
    animated.indexOf('function FBXAnimatedModel')
  );
  const fbxSection = animated.slice(animated.indexOf('function FBXAnimatedModel'));

  assert.match(gltfSection, /mountOwnedMaterialScene/);
  assert.doesNotMatch(gltfSection, /useMemo/);
  assert.doesNotMatch(gltfSection, /useFrame/);
  assert.match(fbxSection, /useFrame/);
});

test('editor and player source apply the shared outer-scale model contract', () => {
  for (const source of [editorScene, player]) {
    assert.match(source, /createModelRenderContract/);
    assert.match(source, /scale=\{modelRender\.outerScale\}/);
    assert.match(source, /position=\{modelRender\.innerPosition\}/);
    assert.match(source, /scale=\{modelRender\.innerScale\}/);
  }
  assert.match(player, /radiusRef\.current = modelRender\.touchRadius/);
});

test('ShapePreview source keeps model error fallback inside its leased Canvas', () => {
  assert.match(
    preview,
    /<PreviewCanvas>[\s\S]*<PreviewErrorBoundary[\s\S]*fallback=\{<ShapeMesh shape="capsule" color=\{color\} \/>\}/
  );
  assert.doesNotMatch(preview, /const capsuleFallback = <PreviewCanvas>/);
});
