const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('dragon route owns an interactive local-asset showcase', () => {
  const model = fs.readFileSync('components/showcase/RedMetalDragon.tsx', 'utf8');
  const scene = fs.readFileSync('components/showcase/DragonShowcase.tsx', 'utf8');
  const page = fs.readFileSync('app/dragon/page.tsx', 'utf8');
  assert.match(model, /\/models\/red-metal-dragon\.glb/);
  assert.match(model, /useFrame/);
  assert.match(model, /castShadow/);
  assert.match(scene, /<Canvas/);
  assert.match(scene, /<OrbitControls/);
  assert.match(scene, /Suspense/);
  assert.match(scene, /clamp\(520px, 70vh, 720px\)/);
  assert.match(page, /Red Metal Dragon/);
  assert.match(page, /Drag to orbit/);
});
