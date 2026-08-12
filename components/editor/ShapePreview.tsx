'use client';

import { Component, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import AnimatedModel from './AnimatedModel';
import { PreviewCanvasLeaseController, selectorPreviewCanvasBudget, type PreviewCanvasKind } from './previewCanvasBudget';

interface ModelBoundsLike {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

interface ShapePreviewProps {
  shape: string;
  color: string;
  size?: number;
  modelUrl?: string;
  previewScale?: number;
  previewRotation?: [number, number, number];
  /** Optional: model bounds for auto-fit centering. If omitted or when
   *  previewScale is explicitly provided, the legacy fixed transform is used. */
  modelBounds?: ModelBoundsLike;
}

/**
 * Compute scale + Y offset so a model with the given local-space bounds fills
 * ~60% of the preview tile and sits centered vertically at the tile midline.
 * Falls back to the legacy fixed transform when bounds are absent.
 *
 * Camera is fixed at position [2,2,2] fov 50 with target (0,0,0), so the
 * viewport at the target plane spans roughly 3.2 units vertically. Targeting
 * 1.9u fills the tile without cropping while leaving a small margin for the
 * autoRotate orbit.
 */
function autoFitTransform(bounds: ModelBoundsLike | undefined): {
  scale: number;
  positionY: number;
} {
  if (!bounds) return { scale: 0.62, positionY: -0.5 };
  const height = Math.max(bounds.max.y - bounds.min.y, 0.01);
  const width = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 0.01);
  const targetHeight = 1.9;
  const targetWidth = 2.6;
  const scale = Math.min(targetHeight / height, targetWidth / width);
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  return { scale, positionY: -centerY * scale };
}

function LoadingPreview() {
  return (
    <Html center>
      <span className="rounded-full bg-slate-900/80 px-2 py-1 text-[10px] font-semibold text-white">
        Loading…
      </span>
    </Html>
  );
}

interface PreviewTransformProps {
  previewScale?: number;
  previewRotation?: [number, number, number];
  modelBounds?: ModelBoundsLike;
}

/**
 * Resolve the final (scale, positionY) for a preview group. Explicit
 * previewScale wins (used by Minion whose FBX has no bounds); otherwise
 * we auto-fit from modelBounds; otherwise the legacy 0.62/-0.5 defaults.
 */
function resolvePreviewTransform({ previewScale, modelBounds }: PreviewTransformProps): {
  scale: number;
  positionY: number;
} {
  if (previewScale != null) return { scale: previewScale, positionY: -0.5 };
  return autoFitTransform(modelBounds);
}

function PreviewGltfModel({ modelUrl, previewScale, previewRotation, modelBounds }: { modelUrl: string } & PreviewTransformProps) {
  const { scene: sourceScene } = useGLTF(modelUrl);
  const scene = useMemo(() => {
    const clone = SkeletonUtils.clone(sourceScene);

    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      object.castShadow = true;
      object.receiveShadow = true;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => {
          const previewMaterial = material.clone();
          previewMaterial.side = THREE.FrontSide;
          previewMaterial.needsUpdate = true;
          return previewMaterial;
        })
        : (() => {
          const previewMaterial = object.material.clone();
          previewMaterial.side = THREE.FrontSide;
          previewMaterial.needsUpdate = true;
          return previewMaterial;
        })();
    });

    return clone;
  }, [sourceScene]);

  useEffect(() => () => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }, [scene]);

  const { scale, positionY } = resolvePreviewTransform({ previewScale, modelBounds });
  const rotation = previewRotation ?? [0, -0.55, 0];
  return (
    <group position={[0, positionY, 0]} rotation={rotation} scale={scale}>
      <primitive object={scene} dispose={null} />
    </group>
  );
}

// FBX path — useGLTF can't parse FBX, so delegate to AnimatedModel (the same
// loader the runtime uses). Static preview: playAnimation={false}.
function PreviewFbxModel({ modelUrl, previewScale, previewRotation, modelBounds }: { modelUrl: string } & PreviewTransformProps) {
  const { scale, positionY } = resolvePreviewTransform({
    previewScale: previewScale ?? (modelBounds ? undefined : 0.14),
    modelBounds,
  });
  const rotation = previewRotation ?? [0, 0, 0];
  return (
    <group position={[0, positionY, 0]} rotation={rotation}>
      <AnimatedModel
        url={modelUrl}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        scale={[scale, scale, scale]}
        playAnimation={false}
      />
    </group>
  );
}

function PreviewModel({ modelUrl, previewScale, previewRotation, modelBounds }: { modelUrl: string } & PreviewTransformProps) {
  const ext = modelUrl.split('.').pop()?.toLowerCase();
  if (ext === 'fbx') {
    return <PreviewFbxModel modelUrl={modelUrl} previewScale={previewScale} previewRotation={previewRotation} modelBounds={modelBounds} />;
  }
  return <PreviewGltfModel modelUrl={modelUrl} previewScale={previewScale} previewRotation={previewRotation} modelBounds={modelBounds} />;
}

interface PreviewErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface PreviewErrorBoundaryState {
  hasError: boolean;
}

class PreviewErrorBoundary extends Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
  state: PreviewErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PreviewErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function PreviewCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      camera={{ position: [2, 2, 2], fov: 50 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: '100%', height: '100%' }}
    >
      {children}
    </Canvas>
  );
}

/**
 * The 3D preview canvas below speaks GLB/GLTF via drei's useGLTF and FBX via
 * AnimatedModel's FBXLoader lifecycle. OBJ/STL/DAE still fall through to the
 * lightweight SVG rendering so unsupported formats don't crash the tile
 * (e.g. "Unexpected identifier 'Kaydara'" JSON parse errors).
 */
function isPreviewable3D(url: string | undefined): boolean {
  if (!url) return false;
  const ext = url.split('.').pop()?.toLowerCase();
  return ext === 'glb' || ext === 'gltf' || ext === 'fbx';
}

/**
 * Cheap SVG rendering for primitive tiles. Bypasses WebGL entirely so the
 * canvas budget stays free for real 3D models. Any number of these can
 * render at once — no context limits, no allocation churn.
 */
function PrimitiveSvg({ shape, color }: { shape: string; color: string }) {
  const common = { fill: color, stroke: '#0f172a', strokeWidth: 2 };
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <ellipse cx="50" cy="88" rx="28" ry="5" fill="#0f172a" opacity="0.12" />
      {shape === 'sphere' && (
        <>
          <circle cx="50" cy="47" r="28" {...common} />
          <ellipse cx="40" cy="36" rx="9" ry="6" fill="white" opacity="0.38" />
        </>
      )}
      {shape === 'cylinder' && (
        <>
          <path d="M27 31v37c0 8 46 8 46 0V31" {...common} />
          <ellipse cx="50" cy="31" rx="23" ry="9" {...common} />
        </>
      )}
      {shape === 'cone' && (
        <>
          <path d="M50 17 23 69c4 11 50 11 54 0Z" {...common} />
          <ellipse cx="50" cy="69" rx="27" ry="9" fill={color} stroke="#0f172a" strokeWidth="2" />
        </>
      )}
      {shape === 'pyramid' && (
        <>
          <path d="M50 14 20 72l30 12Z" {...common} />
          <path d="M50 14 80 72 50 84Z" fill={color} opacity="0.72" stroke="#0f172a" strokeWidth="2" />
        </>
      )}
      {shape === 'torus' && (
        <>
          <ellipse cx="50" cy="50" rx="30" ry="23" fill="none" stroke="#0f172a" strokeWidth="17" />
          <ellipse cx="50" cy="50" rx="30" ry="23" fill="none" stroke={color} strokeWidth="13" />
        </>
      )}
      {shape === 'capsule' && (
        <>
          <rect x="31" y="15" width="38" height="70" rx="19" {...common} />
          <path d="M36 35c3-11 11-16 22-15" fill="none" stroke="white" strokeWidth="5" opacity="0.3" />
        </>
      )}
      {(shape === 'box' || !['sphere','cylinder','cone','pyramid','torus','capsule'].includes(shape)) && (
        <>
          <path d="m22 35 29-18 28 16-29 18Z" fill={color} stroke="#0f172a" strokeWidth="2" />
          <path d="m22 35 28 16v33L22 68Z" fill={color} opacity="0.82" stroke="#0f172a" strokeWidth="2" />
          <path d="m50 51 29-18v34L50 84Z" fill={color} opacity="0.62" stroke="#0f172a" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

export default function ShapePreview({ shape, color, modelUrl, previewScale, previewRotation, modelBounds }: ShapePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const leaseControllerRef = useRef<PreviewCanvasLeaseController | null>(null);
  const previewId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [hasCanvas, setHasCanvas] = useState(false);
  // Only treat as a model preview when we can actually load it. Unsupported
  // formats fall through to the SVG primitive path — no WebGL context needed.
  const effectiveModelUrl = isPreviewable3D(modelUrl) ? modelUrl : undefined;
  const previewKind: PreviewCanvasKind = 'model';

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    // Generous rootMargin so casual scrolling inside the picker doesn't take
    // a tile "out of view" (which would release its canvas lease and force
    // a reload when it scrolls back in). 1200px on all sides lets the whole
    // modal's worth of tiles stay "visible" even when scrolled well past.
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '1200px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Only real 3D models compete for the canvas budget. SVG primitives render
    // without a WebGL context, so an unbounded number can coexist.
    if (!effectiveModelUrl) return;
    const controller = new PreviewCanvasLeaseController({
      id: previewId,
      kind: previewKind,
      budget: selectorPreviewCanvasBudget,
      onLeaseChange: setHasCanvas,
    });
    leaseControllerRef.current = controller;
    controller.setVisible(isVisible);

    return () => {
      controller.dispose();
      if (leaseControllerRef.current === controller) leaseControllerRef.current = null;
    };
  }, [previewId, previewKind, effectiveModelUrl]);

  useEffect(() => {
    leaseControllerRef.current?.setVisible(isVisible);
  }, [isVisible]);

  // Primitive tiles: SVG only, no canvas budget in play.
  if (!effectiveModelUrl) {
    return (
      <div ref={previewRef} className="h-full w-full">
        <PrimitiveSvg shape={shape} color={color} />
      </div>
    );
  }

  if (!isVisible || !hasCanvas) {
    return (
      <div ref={previewRef} className="flex h-full w-full items-center justify-center" aria-hidden="true">
        {isVisible && <span className="text-[10px] font-medium text-slate-400">Loading preview…</span>}
      </div>
    );
  }

  return (
    <div ref={previewRef} style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}>
      <PreviewCanvas>
        <PreviewErrorBoundary
          key={effectiveModelUrl}
          fallback={<ShapeMesh shape="capsule" color={color} />}
        >
          <>
            <ambientLight intensity={0.8} />
            <directionalLight position={[5, 5, 5]} intensity={0.6} />
            <pointLight position={[-5, 5, -5]} intensity={0.4} />
            <Suspense fallback={<LoadingPreview />}>
              <PreviewModel
                modelUrl={effectiveModelUrl}
                previewScale={previewScale}
                previewRotation={previewRotation}
                modelBounds={modelBounds}
              />
            </Suspense>
            <OrbitControls
              enableZoom={false}
              enablePan={false}
              autoRotate
              autoRotateSpeed={2}
              minPolarAngle={Math.PI / 3}
              maxPolarAngle={Math.PI / 1.5}
            />
          </>
        </PreviewErrorBoundary>
      </PreviewCanvas>
    </div>
  );
}

// ShapeMesh — 3D primitive fallback used inside PreviewCanvas. Kept from the
// pre-metal branch so preview thumbnails without a model URL still render.
function ShapeMesh({ shape, color }: { shape: string; color: string }) {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 5, 5]} intensity={0.6} />
      <pointLight position={[-5, 5, -5]} intensity={0.4} />
      {shape === 'box' && (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {shape === 'sphere' && (
        <mesh>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {shape === 'cylinder' && (
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {shape === 'cone' && (
        <mesh>
          <coneGeometry args={[0.6, 1, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {shape === 'pyramid' && (
        <mesh>
          <coneGeometry args={[0.7, 1, 4]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {shape === 'torus' && (
        <mesh>
          <torusGeometry args={[0.6, 0.2, 16, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {shape === 'capsule' && (
        <mesh>
          <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={2}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.5}
      />
    </>
  );
}

