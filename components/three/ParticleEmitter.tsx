'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createParticleState,
  setParticleSize,
  setParticleAmount,
  stepParticles,
  particleAlpha,
  isParticlePreset,
  MAX_PARTICLES,
} from '@/lib/effects/particles';

/**
 * A standalone, always-on particle emitter for a Particles object.
 *
 * Separate from `components/player/ParticleField`, which renders emitters
 * driven by blocks and only exists inside the player. This one is placed in a
 * scene and just runs, which means the editor can render it too — and that is
 * the point of making particles an object at all.
 *
 * Every particle question in this project has come down to the same thing: you
 * cannot see particles while building, only after pressing Play. Place one of
 * these and it emits live in the Scene tab while you drag it around.
 *
 * The simulation is the same tested module the block path uses. This file owns
 * only the geometry and the shader.
 */

export function ParticleEmitter({
  effect,
  position,
  sizePercent = 100,
  amountPercent = 100,
  floorY,
}: {
  effect: string;
  position: [number, number, number];
  sizePercent?: number;
  amountPercent?: number;
  /** Particles settle here rather than falling through. */
  floorY?: number;
}) {
  const pointsRef = useRef<THREE.Points | null>(null);
  const stateRef = useRef(createParticleState());

  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    g.setDrawRange(0, 0);

    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { uScale: { value: 900 } },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying vec3 vColour;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColour = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColour;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d);
          if (r > 0.5) discard;
          gl_FragColor = vec4(vColour, vAlpha * smoothstep(0.5, 0.15, r));
        }`,
    });
    return { geometry: g, material: m };
  }, []);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points) return;

    const state = stateRef.current;
    setParticleSize(state, sizePercent / 100);
    setParticleAmount(state, amountPercent / 100);

    stepParticles(state, delta, {
      trail: isParticlePreset(effect) ? effect : 'sparkle',
      at: { x: position[0], y: position[1], z: position[2] },
      floorY,
    });

    const geo = points.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const siz = geo.getAttribute('size') as THREE.BufferAttribute;
    const alp = geo.getAttribute('alpha') as THREE.BufferAttribute;
    const posArray = pos.array as Float32Array;
    const colArray = col.array as Float32Array;
    const sizArray = siz.array as Float32Array;
    const alpArray = alp.array as Float32Array;

    let n = 0;
    for (const p of state.particles) {
      if (n >= MAX_PARTICLES) break;
      const i3 = n * 3;
      posArray[i3] = p.x;
      posArray[i3 + 1] = p.y;
      posArray[i3 + 2] = p.z;
      colArray[i3] = p.r;
      colArray[i3 + 1] = p.g;
      colArray[i3 + 2] = p.b;
      sizArray[n] = p.size;
      alpArray[n] = particleAlpha(p);
      n++;
    }

    geo.setDrawRange(0, n);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    siz.needsUpdate = true;
    alp.needsUpdate = true;
    geo.boundingSphere = null;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}

export default ParticleEmitter;
