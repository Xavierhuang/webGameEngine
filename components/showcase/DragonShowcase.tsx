'use client';

import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { RedMetalDragon } from './RedMetalDragon';
import { calculateDragonFitDistance } from './dragonCameraFit';

const DRAGON_HALF_EXTENTS = { width: 2.901, height: 2.1, depth: 1.983 };
const DRAGON_MARGIN = 0.35;
const DRAGON_TARGET = new THREE.Vector3(0, -0.85, 0);

function ModelFallback() {
  return (
    <Html center>
      <div className="rounded-full border border-red-300/30 bg-stone-950/80 px-4 py-2 text-sm font-medium text-red-100 shadow-lg backdrop-blur">
        Forging dragon…
      </div>
    </Html>
  );
}

function ResponsiveDragonControls() {
  const { camera, size } = useThree();
  const aspect = size.width / size.height;
  const verticalFovDegrees = aspect < 1 ? 52 : 42;
  const minDistance = calculateDragonFitDistance({
    aspect,
    verticalFovDegrees,
    halfExtents: DRAGON_HALF_EXTENTS,
    margin: DRAGON_MARGIN,
  });

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    camera.fov = verticalFovDegrees;
    const targetOffset = camera.position.clone().sub(DRAGON_TARGET);
    if (targetOffset.length() < minDistance) {
      camera.position.copy(DRAGON_TARGET).add(targetOffset.setLength(minDistance));
    }
    camera.updateProjectionMatrix();
  }, [camera, minDistance, verticalFovDegrees]);

  return (
    <OrbitControls
      enablePan={false}
      minDistance={minDistance}
      maxDistance={Math.max(14, minDistance + 3)}
      minPolarAngle={0.55}
      maxPolarAngle={1.55}
      target={[0, -0.85, 0]}
    />
  );
}

export default function DragonShowcase() {
  return (
    <ErrorBoundary
      fallback={
        <div
          className="flex min-h-[520px] items-center justify-center rounded-3xl border border-red-400/30 bg-[#210809] px-6 text-center text-red-100"
          role="alert"
        >
          Unable to load the dragon model.
        </div>
      }
    >
      <div
        className="overflow-hidden rounded-3xl border border-red-400/25 shadow-2xl shadow-black/40"
        style={{ height: 'clamp(520px, 70vh, 720px)' }}
      >
        <Canvas shadows dpr={[1, 2]} camera={{ position: [6.5, 3.6, 8], fov: 42 }}>
          <ResponsiveDragonControls />
          <color attach="background" args={['#210809']} />
          <fog attach="fog" args={['#3a100f', 8, 22]} />
          <hemisphereLight args={['#ffb3a5', '#160506', 1.15]} />
          <directionalLight castShadow position={[5, 8, 5]} intensity={2.6} shadow-mapSize={[2048, 2048]} />
          <pointLight color="#ff2835" position={[-5, 3, -4]} intensity={20} distance={10} />
          <pointLight color="#ffd5ad" position={[2, 1, 6]} intensity={5} distance={9} />

          <mesh receiveShadow position={[0, -2.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[6.5, 64]} />
            <meshStandardMaterial color="#26090a" metalness={0.1} roughness={0.76} />
          </mesh>

          <Suspense fallback={<ModelFallback />}>
            <RedMetalDragon />
          </Suspense>
        </Canvas>
      </div>
    </ErrorBoundary>
  );
}
