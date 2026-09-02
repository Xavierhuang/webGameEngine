'use client';

/**
 * Sky Steps flagship decoration: floating stars, the pulsing portal, fog, and
 * the bounded look-ahead camera. Purely presentational; gameplay stays in
 * GamePlayer.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameObject } from '../../types/game';
import { CAMERA } from '../../lib/constants/game';
import { playerPositionForObject } from '../../lib/player/objectPlacement';

// Per-frame scratch vectors; useFrame callbacks run one at a time.
const SCRATCH_FOLLOW_OFFSET = new THREE.Vector3(...CAMERA.FOLLOW_OFFSET);
const SCRATCH_CAMERA_TARGET = new THREE.Vector3();

/** Purely visual Sky Steps decoration; no child here is registered with the runtime. */
export function SkyStepsWorldPresentation({
  objects,
  legacyGround,
  reducedMotion,
  collectedStarNames,
}: {
  objects: GameObject[];
  legacyGround: boolean;
  reducedMotion: boolean;
  collectedStarNames: string[];
}) {
  const stars = objects.filter((object) => object.type === 'collectible' && /star/i.test(object.name) && !collectedStarNames.includes(object.name));
  const portal = objects.find((object) => /sky portal/i.test(object.name));
  return (
    <>
      <fog attach="fog" args={['#bae6fd', 12, 32]} />
      {!reducedMotion && stars.map((star) => (
        <SkyStepsStarDecoration key={star.id} position={playerPositionForObject(star, legacyGround)} />
      ))}
      {!reducedMotion && portal && (
        <SkyStepsPortalDecoration position={playerPositionForObject(portal, legacyGround)} />
      )}
    </>
  );
}

function SkyStepsStarDecoration({ position }: { position: [number, number, number] }) {
  const visualRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!visualRef.current) return;
    visualRef.current.position.y = 0.11 * Math.sin(state.clock.elapsedTime * 2.4);
    visualRef.current.rotation.y = state.clock.elapsedTime * 1.7;
  });
  return (
    <group position={position} renderOrder={2}>
      <group ref={visualRef}>
        <mesh scale={0.27}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#facc15" emissive="#f59e0b" emissiveIntensity={1.5} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function SkyStepsPortalDecoration({ position }: { position: [number, number, number] }) {
  const visualRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!visualRef.current) return;
    const pulse = 1 + 0.08 * Math.sin(state.clock.elapsedTime * 2);
    visualRef.current.rotation.y = state.clock.elapsedTime * 0.45;
    visualRef.current.scale.setScalar(pulse);
  });
  return (
    <group position={position} renderOrder={2}>
      <group ref={visualRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.58, 0.06, 10, 32]} />
          <meshStandardMaterial color="#a855f7" emissive="#7e22ce" emissiveIntensity={1.7} roughness={0.22} />
        </mesh>
      </group>
    </group>
  );
}

export function SkyStepsCameraPresentation({
  camera,
  characterPositionRef,
  characterVelocityRef,
  landingBumpRef,
  won,
  reducedMotion,
}: {
  camera: THREE.Camera;
  characterPositionRef: React.MutableRefObject<THREE.Vector3 | null>;
  characterVelocityRef: React.MutableRefObject<{ x: number; z: number }>;
  landingBumpRef: React.MutableRefObject<number>;
  won: boolean;
  reducedMotion: boolean;
}) {
  const wasWonRef = useRef(false);
  const winEmphasisRef = useRef(0);
  useFrame((_, delta) => {
    const characterPosition = characterPositionRef.current;
    if (!characterPosition) return;
    const velocity = characterVelocityRef.current;
    const lookAhead = reducedMotion ? 0 : THREE.MathUtils.clamp(velocity.x * 0.16, -0.65, 0.65);
    if (!reducedMotion && landingBumpRef.current > 0) landingBumpRef.current = Math.max(0, landingBumpRef.current - delta * 3.5);
    if (!reducedMotion && won && !wasWonRef.current) winEmphasisRef.current = 1;
    wasWonRef.current = won;
    if (!reducedMotion && winEmphasisRef.current > 0) winEmphasisRef.current = Math.max(0, winEmphasisRef.current - delta * 1.8);
    const landingLift = reducedMotion ? 0 : landingBumpRef.current * 0.13;
    const winLift = reducedMotion ? 0 : winEmphasisRef.current * 0.28;
    const target = SCRATCH_CAMERA_TARGET.copy(SCRATCH_FOLLOW_OFFSET).add(characterPosition);
    target.x += lookAhead;
    target.y += landingLift + winLift;
    camera.position.lerp(target, delta * CAMERA.FOLLOW_LERP_SPEED);
    camera.lookAt(characterPosition.x + lookAhead * 0.65, characterPosition.y + winLift * 0.3, characterPosition.z);
  });
  return null;
}
