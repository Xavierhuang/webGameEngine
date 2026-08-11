const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('camera fit keeps the rotating dragon inside representative canvas aspects', () => {
  const fitModulePath = path.resolve('components/showcase/dragonCameraFit.js');
  assert.ok(fs.existsSync(fitModulePath), 'shared camera fit module must exist');
  const { calculateDragonFitDistance } = require(fitModulePath);
  const halfExtents = { width: 2.901, height: 2.1, depth: 1.983 };
  const margin = 0.35;
  const initialCameraDistance = Math.hypot(6.5, 3.6 + 0.85, 8);
  const cases = [
    { viewport: '320px', aspect: 278 / 588.8, verticalFovDegrees: 52 },
    { viewport: '390px', aspect: 348 / 588.8, verticalFovDegrees: 52 },
    { viewport: 'desktop', aspect: 1150 / 628, verticalFovDegrees: 42 },
  ];

  for (const entry of cases) {
    const distance = calculateDragonFitDistance({
      aspect: entry.aspect,
      verticalFovDegrees: entry.verticalFovDegrees,
      halfExtents,
      margin,
    });
    const rotatingHorizontalHalfExtent = Math.hypot(halfExtents.width, halfExtents.depth);
    const verticalCapacity = distance * Math.tan(entry.verticalFovDegrees * Math.PI / 360);
    const horizontalCapacity = verticalCapacity * entry.aspect;

    assert.ok(Number.isFinite(distance) && distance > 0, `${entry.viewport} distance`);
    assert.ok(horizontalCapacity + 1e-12 >= rotatingHorizontalHalfExtent + margin,
      `${entry.viewport} horizontal fit: ${horizontalCapacity}`);
    assert.ok(verticalCapacity + 1e-12 >= halfExtents.height + margin,
      `${entry.viewport} vertical fit: ${verticalCapacity}`);
    if (entry.viewport === 'desktop') {
      assert.ok(distance <= initialCameraDistance * 0.75,
        `desktop minimum ${distance} must preserve meaningful inward zoom from ${initialCameraDistance}`);
    }
  }
});
