'use client';

import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { CharacterPrefab } from '../../lib/prefabs/characters';
import AnimatedModel from './AnimatedModel';
import ShapePreview from './ShapePreview';

export default function CharacterPreview({ character }: { character: CharacterPrefab }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!character.model_url) {
    return <ShapePreview shape={character.shape} color={character.color} />;
  }

  return (
    <div className="relative h-full w-full">
      {(!loaded || failed) && (
        <div className="absolute inset-0">
          <ShapePreview shape="capsule" color={character.color} />
        </div>
      )}
      {!failed && (
        <Canvas camera={{ position: [0, 1, 4], fov: 35 }} gl={{ alpha: true, antialias: true }}>
          <ambientLight intensity={1.2} />
          <directionalLight position={[4, 6, 5]} intensity={1.4} />
          <group rotation={character.preview_rotation ?? [0, 0, 0]}>
            <AnimatedModel
              url={character.model_url}
              position={[0, -1, 0]}
              rotation={[0, 0, 0]}
              scale={Array(3).fill(character.preview_scale ?? 1) as [number, number, number]}
              playAnimation={false}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          </group>
        </Canvas>
      )}
      {failed && (
        <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-medium text-slate-500">
          Preview unavailable
        </span>
      )}
    </div>
  );
}
