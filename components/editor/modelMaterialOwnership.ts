import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface OwnedMaterialScene<T extends THREE.Object3D> {
  scene: T;
  materials: ReadonlySet<THREE.Material>;
  dispose: () => void;
}

/**
 * Clones a scene graph and gives that runtime instance its own materials.
 * Geometry and material texture references remain loader-owned and shared.
 */
export function cloneSceneWithOwnedMaterials<T extends THREE.Object3D>(
  sourceScene: T
): OwnedMaterialScene<T> {
  const scene = SkeletonUtils.clone(sourceScene) as T;
  const materialClones = new Map<THREE.Material, THREE.Material>();

  const cloneMaterial = (sourceMaterial: THREE.Material) => {
    const existing = materialClones.get(sourceMaterial);
    if (existing) return existing;
    const ownedMaterial = sourceMaterial.clone();
    materialClones.set(sourceMaterial, ownedMaterial);
    return ownedMaterial;
  };

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });

  return {
    scene,
    materials: new Set(materialClones.values()),
    dispose: () => {
      materialClones.forEach((material) => material.dispose());
    },
  };
}

/**
 * Allocates an owned clone during a committed effect and returns that effect's
 * cleanup. Keeping this out of render ensures abandoned React renders allocate
 * no materials, while StrictMode's two effect setups each get a cleanup.
 */
export function mountOwnedMaterialScene<T extends THREE.Object3D>(
  sourceScene: T,
  onMount: (instance: OwnedMaterialScene<T>) => void
): () => void {
  const instance = cloneSceneWithOwnedMaterials(sourceScene);
  try {
    onMount(instance);
  } catch (error) {
    instance.dispose();
    throw error;
  }
  return () => instance.dispose();
}
