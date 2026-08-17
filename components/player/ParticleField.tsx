'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PHYSICS } from '@/lib/constants/game';
import {
  createParticleState,
  setParticleSize,
  setParticleAmount,
  setParticleColour,
  burstParticles,
  stepParticles,
  particleAlpha,
  presetSpec,
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
  /** Multipliers on the preset, 1 being the default. */
  setSize(objectId: string, scale: number): void;
  setAmount(objectId: string, scale: number): void;
  /** Null restores the preset palette — the only way back to multi-coloured confetti. */
  setColour(objectId: string, hex: string | null): void;
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
    g.setAttribute('rotation', new THREE.BufferAttribute(new Float32Array(CAPACITY), 1));
    g.setAttribute('aspect', new THREE.BufferAttribute(new Float32Array(CAPACITY), 1));
    g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(CAPACITY), 1));
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
      setSize: (objectId, scale) => setParticleSize(ensure(objectId).state, scale),
      setAmount: (objectId, scale) => setParticleAmount(ensure(objectId).state, scale),
      setColour: (objectId, hex) => setParticleColour(ensure(objectId).state, hex),
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
    const rot = geo.getAttribute('rotation') as THREE.BufferAttribute;
    const asp = geo.getAttribute('aspect') as THREE.BufferAttribute;
    const glo = geo.getAttribute('glow') as THREE.BufferAttribute;
    const alpha = geo.getAttribute('alpha') as THREE.BufferAttribute;
    const posArray = position.array as Float32Array;
    const colArray = colour.array as Float32Array;
    const sizeArray = size.array as Float32Array;
    const rotArray = rot.array as Float32Array;
    const aspArray = asp.array as Float32Array;
    const gloArray = glo.array as Float32Array;
    const alphaArray = alpha.array as Float32Array;

    let n = 0;
    for (const emitter of emittersRef.current.values()) {
      stepParticles(emitter.state, delta, {
        trail: emitter.trail,
        at: { x: emitter.at[0], y: emitter.at[1], z: emitter.at[2] },
        // Settle on the scene's ground rather than sinking through it.
        floorY: PHYSICS.GROUND_Y,
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
        { const spec = presetSpec(p.preset);
          rotArray[n] = p.rotation; aspArray[n] = spec.aspect; gloArray[n] = spec.glow; }
        n++;
      }
    }

    geo.setDrawRange(0, n);
    position.needsUpdate = true;
    colour.needsUpdate = true;
    size.needsUpdate = true;
    alpha.needsUpdate = true;
    rot.needsUpdate = true;
    asp.needsUpdate = true;
    glo.needsUpdate = true;
    // Without this the cloud vanishes as soon as its first bounding sphere is
    // computed from an empty buffer.
    geo.boundingSphere = null;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}

export default ParticleField;
