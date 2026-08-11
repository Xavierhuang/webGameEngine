import fs from 'node:fs';
import path from 'node:path';
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

function material(object) {
  return Array.isArray(object.material) ? object.material[0] : object.material;
}

function state(object) {
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.map((item) => ({
    name: item.name,
    type: item.type,
    color: item.color?.getHexString(),
    map: item.map,
    side: item.side,
    transparent: item.transparent,
    opacity: item.opacity,
    alphaTest: item.alphaTest,
    depthTest: item.depthTest,
    depthWrite: item.depthWrite,
    metalness: item.metalness,
    roughness: item.roughness,
  }));
}

function equalStates(actual, expected, label) {
  eq(actual.length, expected.length, `${label}: material slot count`);
  for (let materialIndex = 0; materialIndex < expected.length; materialIndex++) {
    for (const [property, value] of Object.entries(expected[materialIndex])) {
      eq(actual[materialIndex][property], value, `${label}: material ${materialIndex} preserves ${property}`);
    }
  }
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
const { MINION_MODEL_URL, repairMinionMaterials } = require('../.build/lib/models/minionMaterials.js');
const { BackSide, BoxGeometry, LoadingManager, Mesh, MeshLambertMaterial, Texture } = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, '../..');
const fbxPath = path.join(root, 'public/models/minion/FBX/Minion_FBX.fbx');
const bytes = fs.readFileSync(fbxPath);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

function loadMinion() {
  return new FBXLoader(new LoadingManager()).parse(buffer, '/models/minion/FBX/');
}

const source = loadMinion();
const repaired = source.clone(true);
const sourceBody = source.getObjectByName('polySurface31');
const repairedBody = repaired.getObjectByName('polySurface31');
const sourceGoggles = source.getObjectByName('pCylinder15');
const unknownTexture = new Texture();
const unknownMaterial = new MeshLambertMaterial({
  color: 0x123456,
  map: unknownTexture,
  side: BackSide,
  transparent: true,
  opacity: 0.45,
  alphaTest: 0.25,
  depthTest: false,
  depthWrite: false,
});
unknownMaterial.name = 'futureMaterial';
const unknownMesh = new Mesh(new BoxGeometry(), unknownMaterial);
repaired.add(unknownMesh);

eq(MINION_MODEL_URL, '/models/minion/FBX/Minion_FBX.fbx', 'Minion URL remains the exact built-in model path');
eq(repairMinionMaterials(repaired, MINION_MODEL_URL), true, 'Minion URL is repaired');
eq(material(repairedBody).color.getHexString(), 'f5d328', 'body becomes Minion yellow');
eq(material(repaired.getObjectByName('pCylinder13')).color.getHexString(), 'f5d328', 'left arm becomes yellow');
eq(material(repaired.getObjectByName('Minion_Hand_Left')).color.getHexString(), '20242b', 'left glove becomes charcoal');
eq(material(repaired.getObjectByName('polySurface15')).color.getHexString(), '20242b', 'lambert dark detail becomes charcoal');
eq(material(repaired.getObjectByName('Minion_Line')).color.getHexString(), '20242b', 'V-Ray line detail becomes charcoal');
eq(material(repaired.getObjectByName('polySurface11')).color.getHexString(), '20242b', 'V-Ray dark detail becomes charcoal');
eq(material(repaired.getObjectByName('pCube20')).color.getHexString(), 'f7f7f2', 'teeth become white');
const repairedGoggles = material(repaired.getObjectByName('pCylinder15'));
const originalGoggles = material(sourceGoggles);
eq(repairedGoggles.type, 'MeshStandardMaterial', 'goggles use a standard metallic material');
eq(repairedGoggles.color.getHexString(), 'b8bec7', 'goggles become silver');
eq(repairedGoggles.metalness, 0.75, 'goggles are metallic');
eq(repairedGoggles.roughness, 0.3, 'goggles use the specified roughness');
eq(repairedGoggles.name, 'VRayMtl7', 'goggles retain their material name');
eq(repairedGoggles.map, originalGoggles.map, 'goggles retain their map assignment');
eq(repairedGoggles.side, originalGoggles.side, 'goggles retain their render side');
eq(repairedGoggles.transparent, originalGoggles.transparent, 'goggles retain transparency mode');
eq(repairedGoggles.opacity, originalGoggles.opacity, 'goggles retain opacity');
eq(repairedGoggles.alphaTest, originalGoggles.alphaTest, 'goggles retain alpha testing');
eq(repairedGoggles.depthTest, originalGoggles.depthTest, 'goggles retain depth testing');
eq(repairedGoggles.depthWrite, originalGoggles.depthWrite, 'goggles retain depth writing');

const eyeMaterials = repaired.getObjectByName('Minion_Eye_polySurface19_polySurface20').material;
eq(eyeMaterials[0].color.getHexString(), 'f7f7f2', 'eye white is restored');
eq(eyeMaterials[1].color.getHexString(), '704214', 'iris becomes warm brown');
eq(eyeMaterials[2].color.getHexString(), '171717', 'pupil remains near-black');

const denim = material(repaired.getObjectByName('polySurface32'));
eq(Boolean(denim.map), true, 'denim texture remains attached');
eq(denim.color.getHexString(), 'ffffff', 'denim uses a neutral-white tint');
eq(material(sourceBody).color.getHexString(), '808080', 'cached source material stays gray');
eq(material(sourceBody) === material(repairedBody), false, 'repaired material is not shared with source');
eq(material(unknownMesh) === unknownMaterial, false, 'unknown material is cloned before use');
eq(material(unknownMesh).name, 'futureMaterial', 'unknown material name remains unchanged');
eq(material(unknownMesh).color.getHexString(), '123456', 'unknown material color remains unchanged');
eq(material(unknownMesh).map, unknownTexture, 'unknown material retains its exact map');
eq(material(unknownMesh).side, BackSide, 'unknown material retains its render side');
eq(material(unknownMesh).transparent, true, 'unknown material retains transparency mode');
eq(material(unknownMesh).opacity, 0.45, 'unknown material retains opacity');
eq(material(unknownMesh).alphaTest, 0.25, 'unknown material retains alpha testing');
eq(material(unknownMesh).depthTest, false, 'unknown material retains depth testing');
eq(material(unknownMesh).depthWrite, false, 'unknown material retains depth writing');

const untouched = loadMinion().clone(true);
const untouchedBody = untouched.getObjectByName('polySurface31');
const untouchedBodyMaterial = material(untouchedBody);
eq(repairMinionMaterials(untouched, '/uploads/models/other.fbx'), false, 'non-Minion URL is not repaired');
eq(material(untouchedBody).color.getHexString(), '808080', 'non-Minion body remains its original color');
eq(material(untouchedBody) === untouchedBodyMaterial, true, 'non-Minion material identity remains unchanged');

const repeated = loadMinion().clone(true);
repairMinionMaterials(repeated, MINION_MODEL_URL);
const firstState = [
  state(repeated.getObjectByName('polySurface31')),
  state(repeated.getObjectByName('polySurface32')),
  state(repeated.getObjectByName('pCylinder15')),
  state(repeated.getObjectByName('Minion_Eye_polySurface19_polySurface20')),
];
repairMinionMaterials(repeated, MINION_MODEL_URL);
const secondState = [
  state(repeated.getObjectByName('polySurface31')),
  state(repeated.getObjectByName('polySurface32')),
  state(repeated.getObjectByName('pCylinder15')),
  state(repeated.getObjectByName('Minion_Eye_polySurface19_polySurface20')),
];
for (let objectIndex = 0; objectIndex < firstState.length; objectIndex++) {
  equalStates(secondState[objectIndex], firstState[objectIndex], `a second repair preserves object ${objectIndex}`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
