'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface ShapePreviewProps {
  shape: string;
  color: string;
  size?: number;
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

export default function ShapePreview({ shape, color, size = 200 }: ShapePreviewProps) {
  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}>
      <Canvas
        camera={{ position: [2, 2, 2], fov: 50 }}
        gl={{ alpha: true, antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <ShapeMesh shape={shape} color={color} />
      </Canvas>
    </div>
  );
}









