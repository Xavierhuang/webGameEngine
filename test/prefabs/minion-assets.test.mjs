import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let failures = 0;

function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) {
    failures++;
    console.log(`FAIL ${label}: expected ${expected}, got ${actual}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// FBXLoader delegates external images to ImageLoader. This small DOM surface
// lets the real loader resolve image URLs without fetching them in Node.
globalThis.document = {
  createElementNS() {
    return {
      addEventListener() {},
      removeEventListener() {},
      set src(value) { this.currentSrc = value; },
    };
  },
};

const require = createRequire(import.meta.url);
const { CHARACTER_TEMPLATES } = require('../.build/lib/prefabs/characters.js');
const { Box3, Euler, LoadingManager, Vector3 } = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, '../..');
const publicModelDir = path.join(root, 'public/models/minion/FBX');
const fbxPath = path.join(publicModelDir, 'Minion_FBX.fbx');
const texturePath = path.join(publicModelDir, 'jeans_texture4807.jpg');

for (const [assetPath, expectedHash] of [
  [fbxPath, 'c2cfaea92a980a7d70a27a227cf5a0cd9e5bac672b12a95bcfdd92d8d099f247'],
  [texturePath, '52daadea4b11d590dcf7d049a99005bd15e38e9b114b5607c0084c1cb66684ac'],
]) {
  const relativePath = path.relative(root, assetPath);
  const exists = fs.existsSync(assetPath);
  eq(exists, true, `${relativePath} exists`);
  if (exists) {
    eq(fs.statSync(assetPath).size > 0, true, `${relativePath} is non-empty`);
    eq(sha256(assetPath), expectedHash, `${relativePath} matches the supplied asset`);
  }
}

if (fs.existsSync(fbxPath)) {
  const requestedUrls = [];
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    requestedUrls.push(url);
    return url;
  });

  const bytes = fs.readFileSync(fbxPath);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const model = new FBXLoader(manager).parse(buffer, '/models/minion/FBX/');

  eq(
    JSON.stringify(requestedUrls),
    JSON.stringify(['/models/minion/FBX/jeans_texture4807.jpg']),
    'the shipped FBX resolves exactly its one external texture beside the FBX',
  );
  eq(
    requestedUrls.some((url) => url.includes('brown-eye.png')),
    false,
    'the supplied FBX does not reference brown-eye.png',
  );

  const minion = CHARACTER_TEMPLATES.find((template) => template.id === 'minion');
  const modelHeight = new Box3().setFromObject(model).getSize(new Vector3()).y;
  const previewHeight = modelHeight * (minion?.preview_scale ?? 1);
  eq(
    previewHeight >= 1.4 && previewHeight <= 2.2,
    true,
    'the configured preview scale frames the real Minion geometry at a useful height',
  );

  const runtimeHeight = modelHeight * ((minion?.size ?? 100) / 100);
  eq(
    runtimeHeight >= 1.4 && runtimeHeight <= 2.2,
    true,
    'the configured character size frames the real Minion geometry in editor and player',
  );

  const eye = model.getObjectByName('Minion_Eye_polySurface19_polySurface20');
  const previewRotation = new Euler(...(minion?.preview_rotation ?? [0, 0, 0]));
  const rotatedModelCenter = new Box3().setFromObject(model).getCenter(new Vector3()).applyEuler(previewRotation);
  const rotatedEyeCenter = new Box3().setFromObject(eye).getCenter(new Vector3()).applyEuler(previewRotation);
  eq(
    rotatedEyeCenter.z > rotatedModelCenter.z,
    true,
    'the configured preview rotation faces the Minion eye toward the positive-Z camera',
  );
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
