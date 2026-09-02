'use client';

/**
 * Loaders for a model referenced by URL: glb/gltf, obj, stl, fbx, dae, with a
 * box fallback for anything else. Split out of GamePlayer.tsx, which had
 * grown to ten components in one file.
 */

import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { Box, useGLTF } from '@react-three/drei';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';

export type ExtModelProps = {
  modelUrl: string;
  meshRef: React.RefObject<any>;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number] | number;
  color: string;
};

function GLTFExtModel({ modelUrl, meshRef, position, rotation, scale }: ExtModelProps) {
  const gltf = useGLTF(modelUrl) as any;
  // useGLTF caches one source scene per URL. A collectible can share its URL
  // with siblings, but Three.js can parent one Object3D only once; cloning
  // keeps each render and touch collider at its own authored position.
  const instance = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  return <primitive ref={meshRef} object={instance} position={position} rotation={rotation} scale={scale} />;
}

function OBJExtModel({ modelUrl, meshRef, position, rotation, scale }: ExtModelProps) {
  const obj = useLoader(OBJLoader as any, modelUrl);
  return <primitive ref={meshRef} object={obj as any} position={position} rotation={rotation} scale={scale} />;
}

function STLExtModel({ modelUrl, meshRef, position, rotation, scale, color }: ExtModelProps) {
  const geom = useLoader(STLLoader as any, modelUrl);
  return (
    <mesh ref={meshRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={geom as any} attach="geometry" />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function FBXExtModel({ modelUrl, meshRef, position, rotation, scale }: ExtModelProps) {
  const fbx = useLoader(FBXLoader as any, modelUrl);
  return <primitive ref={meshRef} object={fbx as any} position={position} rotation={rotation} scale={scale} />;
}

function ColladaExtModel({ modelUrl, meshRef, position, rotation, scale }: ExtModelProps) {
  const collada = useLoader(ColladaLoader as any, modelUrl);
  return <primitive ref={meshRef} object={(collada as any).scene} position={position} rotation={rotation} scale={scale} />;
}

function BoxFallback({ meshRef, position, rotation, scale, color }: Omit<ExtModelProps, 'modelUrl'>) {
  return (
    <Box ref={meshRef} position={position} rotation={rotation} scale={scale as any}>
      <meshStandardMaterial color={color} />
    </Box>
  );
}

export function ExtensionModel({ ext, ...rest }: ExtModelProps & { ext: string }) {
  switch (ext) {
    case 'glb':
    case 'gltf':
      return <GLTFExtModel {...rest} />;
    case 'obj':
      return <OBJExtModel {...rest} />;
    case 'stl':
      return <STLExtModel {...rest} />;
    case 'fbx':
      return <FBXExtModel {...rest} />;
    case 'dae':
      return <ColladaExtModel {...rest} />;
    default:
      // Unknown extension: fallback to box. No loader hook needed.
      return <BoxFallback {...rest} />;
  }
}
