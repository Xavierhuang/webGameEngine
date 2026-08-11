'use client';

import { Component, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PreviewCanvasLeaseController, selectorPreviewCanvasBudget, type PreviewCanvasKind } from './previewCanvasBudget';

interface ShapePreviewProps {
  shape: string;
  color: string;
  size?: number;
  modelUrl?: string;
}

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

function LoadingPreview() {
  return (
    <Html center>
      <span className="rounded-full bg-slate-900/80 px-2 py-1 text-[10px] font-semibold text-white">
        Loading…
      </span>
    </Html>
  );
}

function PreviewModel({ modelUrl }: { modelUrl: string }) {
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

  return (
    <group position={[0, -0.5, 0]} rotation={[0, -0.55, 0]} scale={0.62}>
      <primitive object={scene} dispose={null} />
    </group>
  );
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

export default function ShapePreview({ shape, color, modelUrl }: ShapePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const leaseControllerRef = useRef<PreviewCanvasLeaseController | null>(null);
  const previewId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [hasCanvas, setHasCanvas] = useState(false);
  const previewKind: PreviewCanvasKind = modelUrl ? 'model' : 'primitive';

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '120px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
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
  }, [previewId, previewKind]);

  useEffect(() => {
    leaseControllerRef.current?.setVisible(isVisible);
  }, [isVisible]);

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
        {modelUrl ? (
          <PreviewErrorBoundary
            key={modelUrl}
            fallback={<ShapeMesh shape="capsule" color={color} />}
          >
            <>
            <ambientLight intensity={0.8} />
            <directionalLight position={[5, 5, 5]} intensity={0.6} />
            <pointLight position={[-5, 5, -5]} intensity={0.4} />
            <Suspense fallback={<LoadingPreview />}>
              <PreviewModel modelUrl={modelUrl} />
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
        ) : (
          <ShapeMesh shape={shape} color={color} />
        )}
      </PreviewCanvas>
    </div>
  );
}




