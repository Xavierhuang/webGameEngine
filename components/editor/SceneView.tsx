'use client';

import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box, Sphere, useGLTF, TransformControls } from '@react-three/drei';
import { Suspense } from 'react';
import * as THREE from 'three';
import AnimatedModel from './AnimatedModel';

interface SceneViewProps {
  scene: any;
  selectedObject?: any;
  onSelectObject: (object: any) => void;
  orbitRef?: any;
  transformMode?: 'translate' | 'scale' | 'rotate';
  onCommitPosition?: (
    id: string,
    posPixels: { x: number; y: number; z: number },
    sizePixels?: { width: number; height: number },
    rotationProperties?: any
  ) => void;
  onRotationChange?: (id: string, rotationDegrees: { x: number; y: number; z: number }) => void;
  onAnimationsDetected?: (objectId: string, animations: string[]) => void;
}

// Sky dome component - renders a large sphere as the sky
function SkyDome() {
  return (
    <mesh position={[0, 0, 0]} scale={[200, 200, 200]} renderOrder={-1000}>
      <sphereGeometry args={[1, 32, 16]} />
      <meshBasicMaterial 
        color="#87CEEB" 
        side={THREE.BackSide} 
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

export default function SceneView({ scene, selectedObject, onSelectObject, orbitRef, transformMode, onCommitPosition, onRotationChange, onAnimationsDetected }: SceneViewProps) {
  // Autoplay any beat loops requested by sound objects
  // This is a simple side-effect trigger in render; guard to only start once per render batch.
  if (scene?.game_objects) {
    const soundWithAutoplay = scene.game_objects.find((o: any) => o.type === 'sound' && (o.properties?.autoplay_beat || (typeof o.properties === 'string' && JSON.parse(o.properties || '{}')?.autoplay_beat)));
    if (soundWithAutoplay) {
      // Lazy import to avoid SSR issues
      try {
        const props = typeof soundWithAutoplay.properties === 'string'
          ? JSON.parse(soundWithAutoplay.properties || '{}')
          : (soundWithAutoplay.properties || {});
        const { default: AudioManager } = require('@/lib/audio/AudioManager');
        AudioManager.get().startBeat(props.beat || 'simple', props.bpm || 120);
      } catch {}
    }
  }
  return (
    <>
      <SkyDome />
      {/* Render game objects */}
      {scene?.game_objects?.map((obj: any) => (
        <GameObject
          key={obj.id}
          object={obj}
          isSelected={selectedObject?.id === obj.id}
          orbitRef={orbitRef}
          transformMode={transformMode}
          onCommitPosition={onCommitPosition}
          onRotationChange={onRotationChange}
          onAnimationsDetected={onAnimationsDetected}
          onClick={() => onSelectObject(obj)}
        />
      ))}
    </>
  );
}

function GameObject({
  object,
  onClick,
  isSelected,
  orbitRef,
  transformMode,
  onCommitPosition,
  onRotationChange,
  onAnimationsDetected,
}: {
  object: any;
  onClick: () => void;
  isSelected?: boolean;
  orbitRef?: any;
  transformMode?: 'translate' | 'scale' | 'rotate';
  onCommitPosition?: (
    id: string,
    posPixels: { x: number; y: number; z: number },
    sizePixels?: { width: number; height: number },
    rotationProperties?: any
  ) => void;
  onRotationChange?: (id: string, rotationDegrees: { x: number; y: number; z: number }) => void;
  onAnimationsDetected?: (objectId: string, animations: string[]) => void;
}) {
  // Do not render sound objects as visible geometry
  if (object.type === 'sound') {
    return null;
  }
  const meshRef = useRef<any>();
  const hasMovedRef = useRef(false);
  const [localPosition, setLocalPosition] = useState<[number, number, number] | null>(null);
  const rotationStartPositionRef = useRef<[number, number, number] | null>(null);
  const [localRotation, setLocalRotation] = useState<[number, number, number] | null>(null);

  useFrame(() => {
    if (meshRef.current && object.properties?.animate) {
      meshRef.current.rotation.y += 0.01;
    }
  });

  // Parse properties if it's a string (JSON)
  const properties = typeof object.properties === 'string' 
    ? JSON.parse(object.properties || '{}')
    : (object.properties || {});

  // Get color from multiple possible locations
  const color = object.color 
    || properties.color 
    || properties.sprite_data?.color 
    || '#6B7280';

  // Convert pixel coordinates to 3D coordinates
  // Assuming a 2D game view where x/y are screen pixels
  // Convert to 3D space (divide by 100 to scale down, adjust Y to be up)
  // Default center position: (500, 300) in pixels = (0, 0) in 3D
  // Treat (0, 0) as center for backward compatibility
  const defaultX = 500; // Center X in pixels
  const defaultY = 300; // Center Y in pixels
  const posX = (object.position_x === 0 || object.position_x == null) ? defaultX : object.position_x;
  const posY = (object.position_y === 0 || object.position_y == null) ? defaultY : object.position_y;
  const dbPosition = [
    (posX / 100) - 5, // Center around 0, scale down
    -(posY / 100) + 3, // Invert Y (screen Y down = 3D Y up), center
    object.position_z || 0,
  ] as [number, number, number];
  
  // Use local position if it exists (from a drag), otherwise use database position
  // For characters, the gizmo should be at the center of the character (torso/waist)
  // The database stores the base position (feet level), so we need to offset up to center
  // Base position is at feet, center is at base + 0.85 (half character height to torso)
  let position = localPosition || dbPosition;
  if (object.type === 'character' && !localPosition) {
    // When loading from database, offset to gizmo center position (torso level)
    // Character base is at feet, so add 0.85 to get to torso center
    position = [position[0], position[1] + 0.85, position[2]];
  } else if (object.type === 'character' && localPosition) {
    // localPosition is already at gizmo center (from dragging), use it directly
    // No additional offset needed
  }

  // Use the passed transformMode, or default to translate
  const currentMode = transformMode || 'translate';

  // Check if this is a platform (needed for rotation handling)
  const isPlatform = object.type === 'platform' || (properties.shape === 'plane');

  // Get rotation from properties (in degrees, convert to radians)
  const rotationFromProps = properties.rotation || {};
  const dbRotation: [number, number, number] = [
    ((rotationFromProps.x || 0) * Math.PI) / 180,
    ((rotationFromProps.y || 0) * Math.PI) / 180,
    ((rotationFromProps.z || 0) * Math.PI) / 180,
  ];
  const rotation = localRotation || dbRotation;
  
  // For platforms, if rotation is all zeros (no user rotation), ensure it's horizontal
  // The base -90 degree X rotation will be applied in the plane rendering

  // Apply rotation from properties to mesh when properties change (from Properties panel)
  useEffect(() => {
    if (meshRef.current) {
      // Apply rotation from properties - this handles manual input from Properties panel
      // Only skip if we're actively dragging in rotate mode
      const isActivelyRotating = currentMode === 'rotate' && hasMovedRef.current;
      if (!isActivelyRotating) {
        // For platforms, we need to add the base rotation to the stored relative rotation
        if (isPlatform) {
          const baseRotationX = -Math.PI / 2;
          meshRef.current.rotation.set(
            baseRotationX + dbRotation[0],
            dbRotation[1],
            dbRotation[2]
          );
        } else {
          meshRef.current.rotation.set(dbRotation[0], dbRotation[1], dbRotation[2]);
        }
        // Clear local rotation so it uses properties rotation
        setLocalRotation(null);
      }
    }
  }, [rotationFromProps.x, rotationFromProps.y, rotationFromProps.z, currentMode, isPlatform]);

  // Clear localPosition when object position changes from database (after save)
  // This ensures the next drag starts fresh
  useEffect(() => {
    // Only clear if we're not currently dragging
    // Also sync the mesh position to match the database position
    if (!hasMovedRef.current && meshRef.current) {
      setLocalPosition(null);
      // For characters, the gizmo is at the center (torso), so we need to offset from base position
      // Base position is dbPosition[1] (feet), center is base + 0.85 (to torso)
      const syncedY = object.type === 'character' 
        ? dbPosition[1] + 0.85  // base (feet) + 0.85 = gizmo center (torso)
        : dbPosition[1];
      meshRef.current.position.set(dbPosition[0], syncedY, dbPosition[2]);
    }
  }, [object.position_x, object.position_y, object.position_z, dbPosition]);

  // Get scale/size
  let scale: [number, number, number];
  let baseWidthPx = 100;
  let baseHeightPx = 100;
  if (isPlatform) {
    baseWidthPx = (properties.size?.width ?? 1000);
    baseHeightPx = (properties.size?.height ?? 50);
    const scaleX = baseWidthPx / 100;
    const scaleY = baseHeightPx / 100;
    scale = [scaleX, scaleY, 1];
  } else {
    const scaleValue = properties.size
      ? (typeof properties.size === 'number' ? properties.size / 100 : (properties.size.width || 50) / 100)
      : (object.scale_x || 1);
    // Ensure uniform scaling on all axes for true cubes/spheres
    scale = [scaleValue, scaleValue, scaleValue];
  }

  // Determine shape from properties
  const shape = properties.shape || properties.sprite_data?.shape || (properties.model_url ? 'model' : (isPlatform ? 'plane' : 'box'));
  const modelUrl = properties.model_url || properties.sprite_data?.model_url;

  const content = (() => {
    if (shape === 'model' && modelUrl) {
      const ext = (modelUrl.split('.').pop() || '').toLowerCase();
      const isAnimatedFormat = ext === 'glb' || ext === 'gltf' || ext === 'fbx';
      const shouldAnimate = object.type === 'character' && isAnimatedFormat;
      
      // Use AnimatedModel for characters with animation-capable formats
      if (shouldAnimate) {
        // Get animation state from properties, or use default if not set
        // But if explicitly set to null/stop/none, respect that
        let animationState = properties.animationState;
        
        // If animationState is explicitly null, undefined, 'stop', or 'none', keep it as is
        if (animationState === null || animationState === 'stop' || animationState === 'none') {
          // Keep it stopped - don't change animationState
        } else if (animationState === undefined || animationState === '') {
          // Only use default if not explicitly set
          if (modelUrl.toLowerCase().includes('walking') || modelUrl.toLowerCase().includes('walk')) {
            animationState = 'walk';
          } else {
            animationState = 'idle';
          }
        }
        
        const shouldPlay = animationState !== null && animationState !== 'stop' && animationState !== 'none' && animationState !== undefined;
        // Pass the actual animationState (even if null) to AnimatedModel, but it will handle stopping
        const finalAnimationState = (animationState === null || animationState === 'stop' || animationState === 'none') ? 'stop' : (animationState || 'idle');
        console.log(`[SceneView] Rendering animated model: ${modelUrl}, state: ${finalAnimationState}, playAnimation: ${shouldPlay}`);
        // For characters, we want the gizmo at the center of the character (torso/waist)
        // The model's pivot is typically at the feet, so we need to offset it down
        // Character height is typically ~1.6-1.8 units, so offset by ~0.85 to center at torso
        // The outer group (meshRef) is at the gizmo center position
        // The inner group offsets the model down so the model's feet align with the base position
        // IMPORTANT: Rotation is applied to the outer group (meshRef) so TransformControls rotates around the center
        const characterCenterOffset = object.type === 'character' ? -0.85 : 0;
        return (
          <group ref={meshRef} position={position} rotation={rotation} onClick={onClick}>
            <group position={[0, characterCenterOffset, 0]}>
              <AnimatedModel
                url={modelUrl}
                position={[0, 0, 0]}
                rotation={[0, 0, 0]}
                scale={scale}
                animationState={finalAnimationState}
                playAnimation={shouldPlay}
                onAnimationsLoaded={(animations) => {
                  console.log(`[SceneView] Animations loaded for object ${object.id}:`, animations);
                  if (onAnimationsDetected) {
                    onAnimationsDetected(object.id, animations);
                  }
                }}
              />
            </group>
          </group>
        );
      }
      
      // Render external 3D model by extension (GLB/GLTF/OBJ/STL/FBX/DAE) - non-animated
      function Model() {
        if (ext === 'glb' || ext === 'gltf') {
        const gltf = useGLTF(modelUrl) as any;
        return <primitive ref={meshRef} object={gltf.scene} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
        }
        // Lazy dynamic loaders to avoid SSR import issues if not installed
        try {
          if (ext === 'obj') {
            const { useLoader } = require('@react-three/fiber');
            const { OBJLoader } = require('three/examples/jsm/loaders/OBJLoader.js');
            const obj = useLoader(OBJLoader, modelUrl);
            return <primitive ref={meshRef} object={obj} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
          }
          if (ext === 'stl') {
            const { useLoader } = require('@react-three/fiber');
            const { STLLoader } = require('three/examples/jsm/loaders/STLLoader.js');
            const geom = useLoader(STLLoader, modelUrl);
            return (
              <mesh ref={meshRef} position={position} rotation={rotation} scale={scale} onClick={onClick}>
                <primitive object={geom} attach="geometry" />
                <meshStandardMaterial color={color} />
              </mesh>
            );
          }
          if (ext === 'fbx') {
            const { useLoader } = require('@react-three/fiber');
            const { FBXLoader } = require('three/examples/jsm/loaders/FBXLoader.js');
            const fbx = useLoader(FBXLoader, modelUrl);
            return <primitive ref={meshRef} object={fbx} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
          }
          if (ext === 'dae') {
            const { useLoader } = require('@react-three/fiber');
            const { ColladaLoader } = require('three/examples/jsm/loaders/ColladaLoader.js');
            const collada = useLoader(ColladaLoader, modelUrl);
            return <primitive ref={meshRef} object={collada.scene} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
          }
        } catch (e) {
          // Fallback if loaders unavailable
          console.warn('Loader not available for', ext, e);
        }
        // Unknown extension: fallback to box
        return (
          <Box ref={meshRef} position={position} rotation={rotation} scale={scale} onClick={onClick}>
            <meshStandardMaterial color={color} />
          </Box>
        );
      }
      return (
        <Suspense fallback={null}>
          <Model />
        </Suspense>
      );
    }

    if (shape === 'cylinder') {
      return (
        <mesh ref={meshRef} position={position} rotation={rotation} scale={scale} onClick={onClick}>
          <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    }

    if (shape === 'cone') {
      return (
        <mesh ref={meshRef} position={position} rotation={rotation} scale={scale} onClick={onClick}>
          <coneGeometry args={[0.6, 1, 24]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    }

    if (shape === 'pyramid') {
      return (
        <mesh ref={meshRef} position={position} rotation={rotation} scale={scale} onClick={onClick}>
          <coneGeometry args={[0.7, 1, 4]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    }

    if (shape === 'torus') {
      return (
        <mesh ref={meshRef} position={position} rotation={rotation} scale={scale[0]} onClick={onClick}>
          <torusGeometry args={[0.6, 0.2, 16, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    }

    if (shape === 'capsule') {
      return (
        <mesh ref={meshRef} position={position} rotation={rotation} scale={scale} onClick={onClick}>
          <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    }

    if (shape === 'plane' || object.type === 'platform') {
      // Render a plane, scaled by width/height in world units
      // Base rotation: -90 degrees on X-axis to lay flat on XZ plane (horizontal)
      // User rotation is applied on top of this base rotation
      // For platforms, we want the rotation to be relative to the horizontal plane
      const baseRotationX = -Math.PI / 2; // -90 degrees to lay flat
      return (
        <mesh
          ref={meshRef}
          position={position}
          scale={scale}
          rotation={[baseRotationX + rotation[0], rotation[1], rotation[2]]} // lay flat on XZ ground + custom rotation
          onClick={onClick}
        >
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    }

    if (object.type === 'collectible' || shape === 'circle' || shape === 'sphere') {
      return (
        <Sphere ref={meshRef} position={position} rotation={rotation} scale={scale[0]} onClick={onClick}>
          <meshStandardMaterial color={color} />
        </Sphere>
      );
    }

    if (object.type === 'character' || object.type === 'obstacle') {
      return (
        <Box ref={meshRef} position={position} rotation={rotation} scale={scale} onClick={onClick}>
          <meshStandardMaterial color={color} />
        </Box>
      );
    }

    // Composite: render children parts as a group
    if (shape === 'composite' && properties.children && Array.isArray(properties.children)) {
      return (
        <group ref={meshRef} position={position} scale={scale} onClick={onClick}>
          {properties.children.map((child: any, idx: number) => {
            const childColor = child.color || color;
            const childScaleValue = typeof child.size === 'number'
              ? child.size / 100
              : (child.size?.width || 50) / 100;
            const childScale: [number, number, number] = [childScaleValue, childScaleValue, childScaleValue];
            const childPos: [number, number, number] = [
              child.offset?.x || 0,
              child.offset?.y || 0,
              child.offset?.z || 0,
            ];
            const childRot = child.rotation || { x: 0, y: 0, z: 0 };
            const childRotRad: [number, number, number] = [
              (childRot.x * Math.PI) / 180,
              (childRot.y * Math.PI) / 180,
              (childRot.z * Math.PI) / 180,
            ];
            if (child.shape === 'sphere' || child.shape === 'circle') {
              return (
                <Sphere key={idx} position={childPos} rotation={childRotRad} scale={childScale[0]}>
                  <meshStandardMaterial color={childColor} />
        </Sphere>
              );
            }
            if (child.shape === 'plane') {
              return (
                <mesh key={idx} position={childPos} scale={childScale} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[1, 1]} />
                  <meshStandardMaterial color={childColor} />
                </mesh>
              );
            }
            if (child.shape === 'cylinder') {
              return (
                <mesh key={idx} position={childPos} rotation={childRotRad} scale={childScale}>
                  <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
                  <meshStandardMaterial color={childColor} />
                </mesh>
              );
            }
            if (child.shape === 'cone') {
              return (
                <mesh key={idx} position={childPos} rotation={childRotRad} scale={childScale}>
                  <coneGeometry args={[0.6, 1, 24]} />
                  <meshStandardMaterial color={childColor} />
                </mesh>
              );
            }
            if (child.shape === 'pyramid') {
              return (
                <mesh key={idx} position={childPos} rotation={childRotRad} scale={childScale}>
                  <coneGeometry args={[0.7, 1, 4]} />
                  <meshStandardMaterial color={childColor} />
                </mesh>
              );
            }
            if (child.shape === 'torus') {
              return (
                <mesh key={idx} position={childPos} rotation={childRotRad} scale={childScale[0]}>
                  <torusGeometry args={[0.6, 0.2, 16, 32]} />
                  <meshStandardMaterial color={childColor} />
                </mesh>
              );
            }
            if (child.shape === 'capsule') {
              return (
                <mesh key={idx} position={childPos} rotation={childRotRad} scale={childScale}>
                  <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
                  <meshStandardMaterial color={childColor} />
                </mesh>
              );
            }
            // default child: box
            return (
              <Box key={idx} position={childPos} rotation={childRotRad} scale={childScale}>
                <meshStandardMaterial color={childColor} />
              </Box>
            );
          })}
        </group>
      );
    }

    // Default: render as box (for sprites, shapes, etc.)
    return (
      <Box ref={meshRef} position={position} rotation={rotation} scale={scale} onClick={onClick}>
        <meshStandardMaterial color={color} />
      </Box>
    );
  })();

  // Render both the object and controls separately
  return (
    <>
      {content}
      {isSelected && (
        <TransformControls
          object={meshRef}
          mode={currentMode}
          showX
          showY
          showZ
          onObjectChange={() => {
            // Track that a transform occurred
            hasMovedRef.current = true;
            if (meshRef.current) {
              if (currentMode === 'rotate') {
                // During rotation, preserve the original position to prevent levitation
                if (rotationStartPositionRef.current) {
                  meshRef.current.position.set(
                    rotationStartPositionRef.current[0],
                    rotationStartPositionRef.current[1],
                    rotationStartPositionRef.current[2]
                  );
                }
                // Update local rotation
                setLocalRotation([
                  meshRef.current.rotation.x,
                  meshRef.current.rotation.y,
                  meshRef.current.rotation.z,
                ]);
                // Update rotation in real-time for the properties panel
                // For platforms, subtract the base rotation to show relative rotation
                if (onRotationChange) {
                  let rotationX = meshRef.current.rotation.x;
                  if (isPlatform) {
                    rotationX = rotationX - (-Math.PI / 2);
                  }
                  const rotationDegrees = {
                    x: Math.round((rotationX * 180) / Math.PI),
                    y: Math.round((meshRef.current.rotation.y * 180) / Math.PI),
                    z: Math.round((meshRef.current.rotation.z * 180) / Math.PI),
                  };
                  onRotationChange(object.id, rotationDegrees);
                }
              } else if (currentMode === 'translate' || currentMode === 'scale') {
                // Update local position for translate/scale modes
                // For characters, meshRef is at the gizmo center (torso), so we use it directly
                // The offset is handled in the rendering structure
                setLocalPosition([
                  meshRef.current.position.x,
                  meshRef.current.position.y,
                  meshRef.current.position.z,
                ]);
              }
            }
          }}
          onMouseDown={() => {
            if (orbitRef?.current) orbitRef.current.enabled = false;
            // Store the starting position when beginning a rotation
            if (currentMode === 'rotate' && meshRef.current) {
              rotationStartPositionRef.current = [
                meshRef.current.position.x,
                meshRef.current.position.y,
                meshRef.current.position.z,
              ];
            }
          }}
          onMouseUp={() => {
            if (orbitRef?.current) orbitRef.current.enabled = true;
            if (onCommitPosition && meshRef.current) {
              const x3 = meshRef.current.position.x;
              let y3 = meshRef.current.position.y;
              const z3 = meshRef.current.position.z || 0;
              
              // For characters, the meshRef is on the outer group (at the gizmo center/torso)
              // The gizmo center is at: basePosition (feet) + 0.85 (to torso)
              // To get back to base position (feet) for saving: gizmoCenter - 0.85
              if (object.type === 'character') {
                // Convert from gizmo center (torso) back to base position (feet)
                y3 = y3 - 0.85;
              }
              
              const posPixels = {
                x: (x3 + 5) * 100,
                y: (-y3 + 3) * 100,
                z: z3,
              };
              
              if (currentMode === 'rotate') {
                // Save rotation to properties
                // For platforms, the mesh rotation includes the base -90° X rotation
                // So we need to subtract it to get the user's relative rotation
                let rotationX = meshRef.current.rotation.x;
                if (isPlatform) {
                  // Subtract the base rotation to get relative rotation
                  rotationX = rotationX - (-Math.PI / 2);
                }
                const rotationDegrees = {
                  x: Math.round((rotationX * 180) / Math.PI),
                  y: Math.round((meshRef.current.rotation.y * 180) / Math.PI),
                  z: Math.round((meshRef.current.rotation.z * 180) / Math.PI),
                };
                const props = typeof object.properties === 'string'
                  ? JSON.parse(object.properties || '{}')
                  : (object.properties || {});
                onCommitPosition(object.id, posPixels, undefined, {
                  ...props,
                  rotation: rotationDegrees,
                });
              } else if (isPlatform && currentMode === 'scale') {
                const widthPx = meshRef.current.scale.x * 100;
                const heightPx = meshRef.current.scale.y * 100;
                onCommitPosition(object.id, posPixels, { width: Math.round(widthPx), height: Math.round(heightPx) });
              } else if (currentMode === 'translate') {
                onCommitPosition(object.id, posPixels);
              }
              hasMovedRef.current = false;
              // Clear local position immediately after commit so next drag starts fresh
              setLocalPosition(null);
            }
          }}
        />
      )}
    </>
  );
}

