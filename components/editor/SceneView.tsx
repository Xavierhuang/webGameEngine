'use client';

import { useRef, useState, useEffect } from 'react';
import { useFrame, useThree, useLoader } from '@react-three/fiber';
import { Box, Sphere, useGLTF, TransformControls } from '@react-three/drei';
import { Suspense } from 'react';
import * as THREE from 'three';
import {
  createModelRenderContract,
  isModelBounds,
} from '../../lib/models/modelRenderContract';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { applyTexture } from '../../lib/models/textureMaterial';
import AnimatedModel from './AnimatedModel';
import { focusSceneCamera } from '../../lib/editor/cameraFocus';
import { ParticleEmitter } from '../three/ParticleEmitter';

interface SceneViewProps {
  scene: any;
  selectedObject?: any;
  focusRequest: number;
  onSelectObject: (object: any) => void;
  orbitRef?: any;
  transformMode?: 'translate' | 'scale' | 'rotate';
  // When true, TransformControls snaps: translate to 0.5 world units,
  // rotate to 15°, scale to 0.1 factor. Matches the Spline "snap on" UX
  // where a drag lands on tidy positions instead of floating decimals
  // (kids place things and get whole numbers, not 4.83271492).
  snapEnabled?: boolean;
  // Bumping cameraPresetRequest snaps the camera to `cameraPresetId`
  // (iso/front/top/side). Same monotonic-request pattern as focusRequest.
  cameraPresetRequest?: number;
  cameraPresetId?: string;
  onCommitPosition?: (
    id: string,
    posPixels: { x: number; y: number; z: number },
    sizePixels?: { width: number; height: number },
    rotationProperties?: any
  ) => void;
  onRotationChange?: (id: string, rotationDegrees: { x: number; y: number; z: number }) => void;
  onAnimationsDetected?: (objectId: string, animations: string[]) => void;
}

function CameraFocusController({
  focusRequest,
  selectedObjectId,
  orbitRef,
}: {
  focusRequest: number;
  selectedObjectId?: string;
  orbitRef?: any;
}) {
  const { camera, scene } = useThree();
  const previousFocusRequest = useRef(focusRequest);

  useEffect(() => {
    if (focusRequest === previousFocusRequest.current) return;
    previousFocusRequest.current = focusRequest;

    const controls = orbitRef?.current;
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    if (!controls || !perspectiveCamera.isPerspectiveCamera) return;

    focusSceneCamera(scene, perspectiveCamera, controls, selectedObjectId);
  }, [camera, focusRequest, orbitRef, scene, selectedObjectId]);

  return null;
}

// Preset camera angles, Spline-style. Kids often orbit into a bad view
// and can't recover; front/top/side/iso snap them back to a canonical
// vantage. Positions chosen against a ground plane at Y=-2 so the
// camera looks slightly downward for front/side, straight down for top.
const CAMERA_PRESETS: Record<string, { position: [number, number, number]; target: [number, number, number] }> = {
  iso: { position: [8, 6, 10], target: [0, 0, 0] },
  front: { position: [0, 3, 14], target: [0, 3, 0] },
  // Top view uses a tiny Z offset so OrbitControls doesn't hit gimbal
  // lock and reset orientation on the first user drag.
  top: { position: [0, 18, 0.001], target: [0, 0, 0] },
  side: { position: [14, 3, 0], target: [0, 3, 0] },
};

function CameraPresetController({
  presetRequest,
  presetId,
  orbitRef,
}: {
  presetRequest: number;
  presetId: string;
  orbitRef?: any;
}) {
  const { camera } = useThree();
  const previous = useRef(presetRequest);
  useEffect(() => {
    if (presetRequest === previous.current) return;
    previous.current = presetRequest;
    const preset = CAMERA_PRESETS[presetId];
    const controls = orbitRef?.current;
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    if (!preset || !controls || !perspectiveCamera.isPerspectiveCamera) return;
    perspectiveCamera.position.set(...preset.position);
    controls.target.set(...preset.target);
    controls.update();
  }, [presetRequest, presetId, camera, orbitRef]);
  return null;
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

export default function SceneView({ scene, selectedObject, focusRequest, onSelectObject, orbitRef, transformMode, snapEnabled = true, cameraPresetRequest = 0, cameraPresetId = 'iso', onCommitPosition, onRotationChange, onAnimationsDetected }: SceneViewProps) {
  return (
    <>
      <CameraFocusController
        focusRequest={focusRequest}
        selectedObjectId={selectedObject?.id}
        orbitRef={orbitRef}
      />
      <CameraPresetController
        presetRequest={cameraPresetRequest}
        presetId={cameraPresetId}
        orbitRef={orbitRef}
      />
      <SkyDome />
      {/* Render game objects */}
      {scene?.game_objects?.map((obj: any) => obj.type === 'sound' ? null : (
        <GameObject
          key={obj.id}
          object={obj}
          isSelected={selectedObject?.id === obj.id}
          orbitRef={orbitRef}
          transformMode={transformMode}
          snapEnabled={snapEnabled}
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
  snapEnabled,
  onCommitPosition,
  onRotationChange,
  onAnimationsDetected,
}: {
  object: any;
  onClick: () => void;
  isSelected?: boolean;
  orbitRef?: any;
  transformMode?: 'translate' | 'scale' | 'rotate';
  snapEnabled?: boolean;
  onCommitPosition?: (
    id: string,
    posPixels: { x: number; y: number; z: number },
    sizePixels?: { width: number; height: number },
    rotationProperties?: any
  ) => void;
  onRotationChange?: (id: string, rotationDegrees: { x: number; y: number; z: number }) => void;
  onAnimationsDetected?: (objectId: string, animations: string[]) => void;
}) {
  // NOTE: sound objects render nothing, but that check must come *after* every
  // hook below. It used to sit here, before them — so when an object's type
  // changed (or a sound object took a list position previously held by a
  // visible one) React saw a different number of hooks for the same position
  // and the component's state became invalid.
  const meshRef = useRef<any>(null);
  const hasMovedRef = useRef(false);
  const [localPosition, setLocalPosition] = useState<[number, number, number] | null>(null);
  const rotationStartPositionRef = useRef<[number, number, number] | null>(null);
  const [localRotation, setLocalRotation] = useState<[number, number, number] | null>(null);

  const textureCacheRef = useRef<{ url: string | null; texture: any }>({ url: null, texture: null });

  useFrame(() => {
    if (meshRef.current && object.properties?.animate) {
      meshRef.current.rotation.y += 0.01;
    }
    // Show the child's drawing in the editor exactly as the player will.
    if (meshRef.current) {
      const props = typeof object.properties === 'string'
        ? (() => { try { return JSON.parse(object.properties || '{}'); } catch { return {}; } })()
        : (object.properties || {});
      applyTexture(meshRef.current, props?.texture_url, textureCacheRef.current);
    }
  });

  // Parse properties if it's a string (JSON)
  const properties = typeof object.properties === 'string' 
    ? JSON.parse(object.properties || '{}')
    : (object.properties || {});
  const persistedModelUrl = properties.model_url || properties.sprite_data?.model_url;
  const modelBounds = properties.model_bounds || properties.sprite_data?.model_bounds;
  const modelOriginOffset = properties.model_origin_offset
    || properties.sprite_data?.model_origin_offset;
  const hasBoundedModel = Boolean(persistedModelUrl && isModelBounds(modelBounds));

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
  if (object.type === 'character' && !hasBoundedModel && !localPosition) {
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
      const syncedY = object.type === 'character' && !hasBoundedModel
        ? dbPosition[1] + 0.85  // base (feet) + 0.85 = gizmo center (torso)
        : dbPosition[1];
      meshRef.current.position.set(dbPosition[0], syncedY, dbPosition[2]);
    }
  }, [object.position_x, object.position_y, object.position_z, dbPosition]);

  // Sound objects have no visible geometry. This guard lives here, after every
  // hook, so the hook count is identical for every object type.
  if (object.type === 'sound') {
    return null;
  }

  // Get scale/size
  let scale: [number, number, number];
  let scaleValue = 1;
  let baseWidthPx = 100;
  let baseHeightPx = 100;
  if (isPlatform) {
    baseWidthPx = (properties.size?.width ?? 1000);
    baseHeightPx = (properties.size?.height ?? 50);
    const scaleX = baseWidthPx / 100;
    const scaleY = baseHeightPx / 100;
    scale = [scaleX, scaleY, 1];
  } else {
    scaleValue = properties.size
      ? (typeof properties.size === 'number' ? properties.size / 100 : (properties.size.width || 50) / 100)
      : (object.scale_x || 1);
    // Ensure uniform scaling on all axes for true cubes/spheres
    scale = [scaleValue, scaleValue, scaleValue];
  }

  // Determine shape from properties
  const shape = properties.shape || properties.sprite_data?.shape || (properties.model_url ? 'model' : (isPlatform ? 'plane' : 'box'));
  const modelUrl = persistedModelUrl;
  const legacyEditorOrigin = object.type === 'character' && !hasBoundedModel
    ? { x: 0, y: -0.85 / scaleValue, z: 0 }
    : modelOriginOffset;
  const modelRender = createModelRenderContract(
    scaleValue,
    modelBounds,
    legacyEditorOrigin
  );

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
        return (
          <group
            ref={meshRef}
            position={position}
            rotation={rotation}
            scale={modelRender.outerScale}
            onClick={onClick}
          >
            <AnimatedModel
              url={modelUrl}
              position={modelRender.innerPosition}
              rotation={[0, 0, 0]}
              scale={modelRender.innerScale}
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
        );
      }
      
      // Each format is its own component calling exactly one loader hook,
      // unconditionally. Previously a single Model() branched on the extension
      // and called a *different* hook per branch — so changing a model's format
      // reordered the hooks, which React forbids and which corrupts state.
      // Selecting between components remounts cleanly instead.
      const modelProps = { meshRef, url: modelUrl, position, rotation, scale, onClick, color };
      return (
        <Suspense fallback={null}>
          <FormatModel ext={ext} {...modelProps} />
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
    if (shape === 'particles') {
      /*
       * A placed effect renders live, here in the editor, while the child
       * drags it around. That is the reason particles became an object: until
       * now they could only be seen by pressing Play, which is where every
       * "I can't see the particles" question came from.
       */
      return (
        <group position={position} onClick={onClick}>
          <ParticleEmitter
            effect={String(properties.effect ?? 'sparkle')}
            position={[0, 0, 0]}
            sizePercent={Number(properties.particleSize ?? 100)}
            amountPercent={Number(properties.particleAmount ?? 100)}
            colour={properties.particleColour ?? null}
          />
          {/* A faint handle so an emitter can still be clicked and moved when
              it happens to be between puffs. */}
          <mesh ref={meshRef}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="#F59E0B" transparent opacity={0.18} />
          </mesh>
        </group>
      );
    }

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

    // Same fix as the player: a collectible with a real model must render as
    // that model, not as the default sphere.
    if (!(shape === 'model' && modelUrl)
        && (object.type === 'collectible' || shape === 'circle' || shape === 'sphere')) {
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
      <group userData={{ gameObjectId: object.id }}>{content}</group>
      {isSelected && (
        <TransformControls
          object={meshRef}
          mode={currentMode}
          showX
          showY
          showZ
          // Snap to tidy increments so drops land on round numbers instead
          // of floating decimals — matches Spline's grid-snap UX. Falsy
          // disables the snap so the user can free-drag for precision.
          translationSnap={snapEnabled ? 0.5 : null}
          rotationSnap={snapEnabled ? Math.PI / 12 : null}
          scaleSnap={snapEnabled ? 0.1 : null}
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
              if (object.type === 'character' && !hasBoundedModel) {
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

// ---------------------------------------------------------------------------
// External model rendering, one component per format.
//
// These exist so that each loader hook is called unconditionally from a single
// component. Branching on file extension *inside* one component and calling a
// different hook per branch violates the rules of hooks: swapping a model's
// format changes the hook order and React's state for that position is no
// longer valid.
// ---------------------------------------------------------------------------

interface FormatModelProps {
  meshRef: any;
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  onClick: (e?: any) => void;
  color: string;
}

function GltfFormatModel({ meshRef, url, position, rotation, scale, onClick }: FormatModelProps) {
  const gltf = useGLTF(url) as any;
  return <primitive ref={meshRef} object={gltf.scene} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
}

function ObjFormatModel({ meshRef, url, position, rotation, scale, onClick }: FormatModelProps) {
  const obj = useLoader(OBJLoader, url);
  return <primitive ref={meshRef} object={obj} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
}

function StlFormatModel({ meshRef, url, position, rotation, scale, onClick, color }: FormatModelProps) {
  const geom = useLoader(STLLoader, url);
  return (
    <mesh ref={meshRef} position={position} rotation={rotation} scale={scale} onClick={onClick}>
      <primitive object={geom} attach="geometry" />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function FbxFormatModel({ meshRef, url, position, rotation, scale, onClick }: FormatModelProps) {
  const fbx = useLoader(FBXLoader, url);
  return <primitive ref={meshRef} object={fbx} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
}

function DaeFormatModel({ meshRef, url, position, rotation, scale, onClick }: FormatModelProps) {
  const collada = useLoader(ColladaLoader, url) as any;
  return <primitive ref={meshRef} object={collada.scene} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
}

/** Pick the renderer for a file extension; unknown formats fall back to a box. */
function FormatModel({ ext, ...props }: FormatModelProps & { ext: string }) {
  switch (ext) {
    case 'glb':
    case 'gltf':
      return <GltfFormatModel {...props} />;
    case 'obj':
      return <ObjFormatModel {...props} />;
    case 'stl':
      return <StlFormatModel {...props} />;
    case 'fbx':
      return <FbxFormatModel {...props} />;
    case 'dae':
      return <DaeFormatModel {...props} />;
    default:
      return (
        <Box
          ref={props.meshRef}
          position={props.position}
          rotation={props.rotation}
          scale={props.scale}
          onClick={props.onClick}
        >
          <meshStandardMaterial color={props.color} />
        </Box>
      );
  }
}
