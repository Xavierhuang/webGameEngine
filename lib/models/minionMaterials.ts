import * as THREE from 'three';

export const MINION_MODEL_URL = '/models/minion/FBX/Minion_FBX.fbx';

const COLORS = {
  yellow: 0xf5d328,
  charcoal: 0x20242b,
  white: 0xf7f7f2,
  brown: 0x704214,
  black: 0x171717,
  silver: 0xb8bec7,
} as const;

type ColorMaterial = THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };

export function repairMinionMaterials(root: THREE.Object3D, modelUrl: string): boolean {
  if (modelUrl !== MINION_MODEL_URL) return false;

  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;

    const mesh = object as THREE.Mesh;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const repaired = originals.map((original) => repairMaterial(original));
    mesh.material = Array.isArray(mesh.material) ? repaired : repaired[0];
  });

  return true;
}

function repairMaterial(original: THREE.Material): THREE.Material {
  switch (original.name) {
    case 'VRayMtl1':
    case 'VRayMtl2':
      return cloneWithColor(original, COLORS.yellow);
    case 'VRayMtl4':
    case 'VRayMtl8':
    case 'VRayMtl9':
    case 'lambert2':
      return cloneWithColor(original, COLORS.charcoal);
    case 'VRayMtl3':
    case 'VRayMtl5':
      return cloneWithColor(original, COLORS.white);
    case 'lambert3':
      return cloneWithColor(original, 0xffffff);
    case 'VRayMtl6':
      return cloneWithColor(original, COLORS.brown);
    case 'lambert9':
      return cloneWithColor(original, COLORS.black);
    case 'VRayMtl7':
      return createGoggleMaterial(original);
    default:
      return original.clone();
  }
}

function cloneWithColor(original: THREE.Material, color: number): THREE.Material {
  const repaired = original.clone() as ColorMaterial;
  repaired.color?.setHex(color);
  return repaired;
}

function createGoggleMaterial(original: THREE.Material): THREE.MeshStandardMaterial {
  const textured = original as ColorMaterial;
  const repaired = new THREE.MeshStandardMaterial({
    color: COLORS.silver,
    map: textured.map,
    side: original.side,
    transparent: original.transparent,
    opacity: original.opacity,
    alphaTest: original.alphaTest,
    depthTest: original.depthTest,
    depthWrite: original.depthWrite,
    metalness: 0.75,
    roughness: 0.3,
  });
  repaired.name = original.name;
  return repaired;
}
