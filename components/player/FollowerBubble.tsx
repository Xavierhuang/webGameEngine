'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export /**
 * Speech bubble that follows the object's live world position, independent of
 * any mesh scale/transform. Rendered as a scene-root sibling of the mesh so the
 * mesh's scale never distorts the bubble offset or size.
 */
function FollowerBubble({
  meshRef,
  bubble,
  yOffset,
}: {
  // RefObject<T | null>: React 19 stopped pretending a ref initialised to
  // null is non-null.
  meshRef: React.RefObject<THREE.Object3D | null>;
  bubble: { text: string; style: 'say' | 'think' } | null;
  yOffset: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current || !meshRef.current) return;
    // Copy world position so parent scale never distorts the anchor.
    meshRef.current.getWorldPosition(groupRef.current.position);
    groupRef.current.position.y += yOffset;
  });
  if (!bubble) return null;
  const border = bubble.style === 'say' ? '2px solid #333' : '2px dashed #333';
  const tailChar = bubble.style === 'say' ? '▾' : '⋯';
  return (
    <group ref={groupRef} renderOrder={999}>
      <Html center distanceFactor={10} zIndexRange={[40, 20]} occlude={false}>
        <div
          style={{
            background: 'white', color: '#111', border, borderRadius: 12, padding: '6px 10px',
            fontFamily: 'system-ui, sans-serif', fontSize: 13, maxWidth: 200, minWidth: 40,
            whiteSpace: 'pre-wrap', textAlign: 'center', pointerEvents: 'none', userSelect: 'none',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)', position: 'relative',
          }}
        >
          {bubble.text}
          <span style={{
            position: 'absolute', left: '50%', bottom: -10, transform: 'translateX(-50%)',
            color: '#333', fontSize: 14, lineHeight: 1,
          }}>{tailChar}</span>
        </div>
      </Html>
    </group>
  );
}
