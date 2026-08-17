'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createParticleState,
  setParticleSize,
  setParticleAmount,
  setParticleColour,
  stepParticles,
  particleAlpha,
  presetSpec,
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
  colour,
  floorY,
}: {
  effect: string;
  position: [number, number, number];
  sizePercent?: number;
  amountPercent?: number;
  /** Overrides the preset palette. Undefined keeps the preset's own colours. */
  colour?: string | null;
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
    g.setAttribute('rotation', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    g.setAttribute('aspect', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
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
        attribute float rotation;
        attribute float aspect;
        attribute float glow;
        varying vec3 vColour;
        varying float vAlpha;
        varying float vRotation;
        varying float vAspect;
        varying float vGlow;
        uniform float uScale;
        void main() {
          vColour = color;
          vAlpha = alpha;
          vRotation = rotation;
          vAspect = aspect;
          vGlow = glow;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Stretched particles need a bigger sprite to stretch inside of.
          gl_PointSize = size * max(1.0, aspect) * uScale / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColour;
        varying float vAlpha;
        varying float vRotation;
        varying float vAspect;
        varying float vGlow;
        void main() {
          // Rotate the sprite's own coordinates, then squash one axis: one
          // shader draws a tumbling confetti flake, a stretched spark and a
          // round puff, depending only on the preset's numbers.
          vec2 d = gl_PointCoord - vec2(0.5);
          float c = cos(vRotation);
          float s = sin(vRotation);
          vec2 r = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
          // Squash the short axis rather than widening the long one. Widening
          // pushes the shape past the edge of its own point sprite, which
          // clips it into a rectangle — it rendered as coloured squares until
          // this was the other way round. gl_PointSize already grew by aspect,
          // so squashing here gives length without losing the ends.
          r.y *= max(1.0, vAspect);
          float dist = length(r) * 2.0;
          if (dist > 1.0) discard;

          // Glow is a hot core plus a soft halo, not additive blending:
          // additive reads correctly on a dark scene and disappears on a pale
          // sky, which is exactly how it failed here before it was measured.
          float core = smoothstep(1.0, 0.35, dist);
          float halo = smoothstep(1.0, 0.0, dist);
          float shape = mix(core, halo * halo, 0.35);
          vec3 lit = mix(vColour, min(vec3(1.0), vColour + 0.55), vGlow * core);
          gl_FragColor = vec4(lit, vAlpha * shape);
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
    setParticleColour(state, colour ?? null);

    stepParticles(state, delta, {
      trail: isParticlePreset(effect) ? effect : 'sparkle',
      at: { x: position[0], y: position[1], z: position[2] },
      floorY,
    });

    const geo = points.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const siz = geo.getAttribute('size') as THREE.BufferAttribute;
    const rot = geo.getAttribute('rotation') as THREE.BufferAttribute;
    const asp = geo.getAttribute('aspect') as THREE.BufferAttribute;
    const glo = geo.getAttribute('glow') as THREE.BufferAttribute;
    const alp = geo.getAttribute('alpha') as THREE.BufferAttribute;
    const posArray = pos.array as Float32Array;
    const colArray = col.array as Float32Array;
    const sizArray = siz.array as Float32Array;
    const rotArray = rot.array as Float32Array;
    const aspArray = asp.array as Float32Array;
    const gloArray = glo.array as Float32Array;
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
      { const spec = presetSpec(p.preset);
        rotArray[n] = p.rotation; aspArray[n] = spec.aspect; gloArray[n] = spec.glow; }
      n++;
    }

    geo.setDrawRange(0, n);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    siz.needsUpdate = true;
    alp.needsUpdate = true;
    rot.needsUpdate = true;
    asp.needsUpdate = true;
    glo.needsUpdate = true;
    geo.boundingSphere = null;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}

export default ParticleEmitter;
