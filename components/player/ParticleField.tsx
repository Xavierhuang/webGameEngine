'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createParticleState,
  burstParticles,
  stepParticles,
  particleAlpha,
  isParticlePreset,
  MAX_PARTICLES,
  type ParticlePreset,
  type ParticleState,
} from '@/lib/effects/particles';

/**
 * Renders every object's particles as a single THREE.Points cloud.
 *
 * The simulation is in `lib/effects/particles.ts` and tested there. This file
 * only owns the GPU side: one geometry, one draw call, buffers written in
 * place each frame.
 *
 * One cloud for the whole scene rather than one per object, because a child
 * putting a fire trail on twenty clones would otherwise create twenty meshes,
 * twenty materials and twenty draw calls. The per-object cap still applies, so
 * the ceiling is emitters × MAX_PARTICLES, and the buffer is allocated once at
 * that ceiling and never resized.
 */

/** How many emitters we size the buffer for. Beyond this, the oldest is dropped. */
const MAX_EMITTERS = 12;
const CAPACITY = MAX_EMITTERS * MAX_PARTICLES;

export interface ParticleController {
  /** One-shot burst at a world position. */
  burst(objectId: string, preset: string, at: [number, number, number]): void;
  /** Continuous emission following an object. Null stops it. */
  setTrail(objectId: string, preset: string | null): void;
  /** Where an object currently is, so trails follow it. */
  updatePosition(objectId: string, at: [number, number, number]): void;
  /** Forget an object entirely — used when a clone is deleted. */
  remove(objectId: string): void;
}

interface Emitter {
  state: ParticleState;
  trail: ParticlePreset | null;
  at: [number, number, number];
}

export function ParticleField({
  onReady,
  onBeforeStep,
}: {
  onReady?: (controller: ParticleController) => void;
  /**
   * Called once per frame before stepping, so trails can follow their objects.
   * The player uses it to push every object's current position in.
   */
  onBeforeStep?: () => void;
}) {
  const emittersRef = useRef<Map<string, Emitter>>(new Map());
  const pointsRef = useRef<THREE.Points | null>(null);
  /**
   * Callbacks held in refs so the setup effect can run exactly once.
   *
   * It previously depended on `onReady`, and the player passes an inline arrow
   * — a new identity every render — so the effect tore down and re-ran
   * constantly, and its cleanup cleared the emitter map each time. A trail was
   * registered and wiped again before a single frame could draw it, which is
   * why nothing appeared on screen at all.
   */
  const onReadyRef = useRef(onReady);
  const onBeforeStepRef = useRef(onBeforeStep);
  useEffect(() => {
    onReadyRef.current = onReady;
    onBeforeStepRef.current = onBeforeStep;
  }, [onReady, onBeforeStep]);

  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(CAPACITY), 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(CAPACITY), 1));
    g.setDrawRange(0, 0);

    /**
     * A small shader rather than PointsMaterial, for two reasons found by
     * looking at the result instead of trusting it.
     *
     * PointsMaterial has a single `size` for the entire cloud, so the
     * per-particle size attribute the simulation produces was being ignored —
     * every sparkle drew at the same scale.
     *
     * And it was additively blended, which is right on a dark background and
     * nearly invisible on this one: the default sky is pale blue, and adding
     * light to something already near white changes almost nothing. Normal
     * alpha blending reads on any backdrop.
     */
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      // Pixels per world unit of particle size at 1 unit from the camera.
      // 320 put a sparkle at about three pixels from the default camera
      // distance, which is technically drawn and practically invisible.
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
          // Perspective size: nearer particles are larger, as with
          // sizeAttenuation, but driven by the per-particle attribute.
          gl_PointSize = size * uScale / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColour;
        varying float vAlpha;
        void main() {
          // Round, soft-edged sprite. Square points read as confetti no matter
          // which preset is running.
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d);
          if (r > 0.5) discard;
          float edge = smoothstep(0.5, 0.15, r);
          gl_FragColor = vec4(vColour, vAlpha * edge);
        }`,
    });
    return { geometry: g, material: m };
  }, []);

  useEffect(() => {
    const emitters = emittersRef.current;
    const ensure = (id: string): Emitter => {
      let e = emitters.get(id);
      if (!e) {
        // Oldest emitter out first, so a clone storm cannot grow the buffer.
        if (emitters.size >= MAX_EMITTERS) {
          const oldest = emitters.keys().next().value;
          if (oldest !== undefined) emitters.delete(oldest);
        }
        e = { state: createParticleState(), trail: null, at: [0, 0, 0] };
        emitters.set(id, e);
      }
      return e;
    };

    const controller: ParticleController = {
      burst: (objectId, preset, at) => {
        if (!isParticlePreset(preset)) return;
        const e = ensure(objectId);
        e.at = at;
        burstParticles(e.state, preset, { x: at[0], y: at[1], z: at[2] });
      },
      setTrail: (objectId, preset) => {
        const e = ensure(objectId);
        e.trail = preset && isParticlePreset(preset) ? preset : null;
      },
      updatePosition: (objectId, at) => {
        const e = emitters.get(objectId);
        if (e) e.at = at;
      },
      remove: (objectId) => {
        emitters.delete(objectId);
      },
    };

    onReadyRef.current?.(controller);
    return () => {
      emitters.clear();
    };
    // Runs once: see onReadyRef above.
  }, []);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points) return;
    onBeforeStepRef.current?.();

    // Reached through the mounted object rather than the memoised variable:
    // writing to a value created during render is what react-hooks/immutability
    // forbids, and this file is new code — the exemption list is for patterns
    // that predate the rule.
    const geo = points.geometry as THREE.BufferGeometry;
    const position = geo.getAttribute('position') as THREE.BufferAttribute;
    const colour = geo.getAttribute('color') as THREE.BufferAttribute;
    const size = geo.getAttribute('size') as THREE.BufferAttribute;
    const alpha = geo.getAttribute('alpha') as THREE.BufferAttribute;
    const posArray = position.array as Float32Array;
    const colArray = colour.array as Float32Array;
    const sizeArray = size.array as Float32Array;
    const alphaArray = alpha.array as Float32Array;

    let n = 0;
    for (const emitter of emittersRef.current.values()) {
      stepParticles(emitter.state, delta, {
        trail: emitter.trail,
        at: { x: emitter.at[0], y: emitter.at[1], z: emitter.at[2] },
      });

      for (const p of emitter.state.particles) {
        if (n >= CAPACITY) break;
        const i3 = n * 3;
        posArray[i3] = p.x;
        posArray[i3 + 1] = p.y;
        posArray[i3 + 2] = p.z;
        // Colour stays true; the fade is carried by its own attribute so a
        // dying particle goes transparent rather than turning black.
        colArray[i3] = p.r;
        colArray[i3 + 1] = p.g;
        colArray[i3 + 2] = p.b;
        sizeArray[n] = p.size;
        alphaArray[n] = particleAlpha(p);
        n++;
      }
    }

    geo.setDrawRange(0, n);
    position.needsUpdate = true;
    colour.needsUpdate = true;
    size.needsUpdate = true;
    alpha.needsUpdate = true;
    // Without this the cloud vanishes as soon as its first bounding sphere is
    // computed from an empty buffer.
    geo.boundingSphere = null;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}

export default ParticleField;
