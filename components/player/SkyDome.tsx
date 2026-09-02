'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { logger } from '../../lib/utils/logger';
import { RENDERING, SCENE } from '../../lib/constants/game';

/** The always-behind-everything sky sphere. */
export // Sky dome - a 3D object that acts as the sky
function SkyDome() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useEffect(() => {
    logger.debug('[SkyDome] Sky dome component mounted and rendering');
    if (meshRef.current) {
      logger.debug('[SkyDome] Mesh created:', {
        position: meshRef.current.position,
        scale: meshRef.current.scale,
        visible: meshRef.current.visible,
        material: meshRef.current.material,
      });
      meshRef.current.frustumCulled = false;
    }
  }, []);
  
  useFrame(() => {
    // Ensure the sky dome is always visible
    if (meshRef.current) {
      meshRef.current.visible = true;
    }
  });
  
  useEffect(() => {
    if (meshRef.current) {
      // Mark this as the sky dome for debugging
      meshRef.current.userData.isSkyDome = true;
      meshRef.current.name = 'SkyDome';
    }
  }, []);
  
  return (
    <mesh 
      ref={meshRef}
      position={[0, 0, 0]} 
      scale={[RENDERING.SKY_DOME_SCALE, RENDERING.SKY_DOME_SCALE, RENDERING.SKY_DOME_SCALE]}
      renderOrder={-10000} // Very low render order to render FIRST (before everything else)
      frustumCulled={false}
      userData={{ isSkyDome: true }}
      name="SkyDome"
    >
      <sphereGeometry args={[1, RENDERING.SKY_DOME_SEGMENTS * 2, RENDERING.SKY_DOME_SEGMENTS]} />
      <meshBasicMaterial 
        color={SCENE.DEFAULT_BACKGROUND_COLOR} 
        side={THREE.BackSide} 
        depthWrite={false}
        depthTest={true} // Enable depth test but write false - renders behind everything
        fog={false}
        transparent={false}
      />
    </mesh>
  );
}
