'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

function applyDragonMaterial(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;

  switch (material.name) {
    case 'Dragon Red Metal':
      material.color.setRGB(0.55, 0.012, 0.018);
      material.metalness = 0.82;
      material.roughness = 0.24;
      break;
    case 'Dark Horn':
      material.color.setRGB(0.055, 0.018, 0.022);
      material.metalness = 0.58;
      material.roughness = 0.3;
      break;
    case 'Dark Wing':
      material.color.setRGB(0.19, 0.012, 0.02);
      material.metalness = 0.35;
      material.roughness = 0.42;
      break;
  }

  material.needsUpdate = true;
  return material;
}

export function RedMetalDragon({ autoRotate = true }: { autoRotate?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/models/red-metal-dragon.glb');
  const dragonScene = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);

    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      object.castShadow = true;
      object.receiveShadow = true;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => applyDragonMaterial(material.clone()))
        : applyDragonMaterial(object.material.clone());
    });

    return clone;
  }, [scene]);

  useFrame((_, delta) => {
    if (autoRotate && group.current) group.current.rotation.y += delta * 0.18;
  });

  return (
    <group ref={group} position={[0, -1.15, 0]} rotation={[0, -0.45, 0]}>
      <primitive object={dragonScene} />
    </group>
  );
}

useGLTF.preload('/models/red-metal-dragon.glb');
