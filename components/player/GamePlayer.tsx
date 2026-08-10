'use client';

import { useState, useEffect, useRef, Suspense, memo, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box, Sphere, Grid, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import AnimatedModel from '../editor/AnimatedModel';
import { logger } from '../../lib/utils/logger';
import {
  PHYSICS,
  CAMERA,
  SCENE,
  LIGHTING,
  MOVEMENT,
  RENDERING,
} from '../../lib/constants/game';
import FPSCounter from './FPSCounter';
import { ErrorBoundary } from '../common/ErrorBoundary';
import type { Project, GameObject, KeyState } from '../../types/game';

interface GamePlayerProps {
  project: Project;
}

export default function GamePlayer({ project }: GamePlayerProps) {
  const [keys, setKeys] = useState<KeyState>({});
  const scene = project.scenes?.[0];
  
  useEffect(() => {
    if (scene) {
      logger.debug('[GamePlayer] Scene background_color from database:', scene.background_color);
    }
  }, [scene]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Normalize key names
      let keyName = e.key.toLowerCase();
      // Map arrow keys
      if (e.key === 'ArrowUp') keyName = 'arrowup';
      else if (e.key === 'ArrowDown') keyName = 'arrowdown';
      else if (e.key === 'ArrowLeft') keyName = 'arrowleft';
      else if (e.key === 'ArrowRight') keyName = 'arrowright';
      else if (e.key === ' ') keyName = ' ';
      
      setKeys((prev) => ({ ...prev, [keyName]: true }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Normalize key names
      let keyName = e.key.toLowerCase();
      // Map arrow keys
      if (e.key === 'ArrowUp') keyName = 'arrowup';
      else if (e.key === 'ArrowDown') keyName = 'arrowdown';
      else if (e.key === 'ArrowLeft') keyName = 'arrowleft';
      else if (e.key === 'ArrowRight') keyName = 'arrowright';
      else if (e.key === ' ') keyName = ' ';
      
      setKeys((prev) => ({ ...prev, [keyName]: false }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="mb-4 text-white">
          <h1 className="text-2xl font-bold">{project.title || 'My Game'}</h1>
          {project.description && (
            <p className="text-gray-400 text-sm mt-1">{project.description}</p>
          )}
        </div>
        <div className="rounded-lg shadow-2xl overflow-hidden" style={{ width: '800px', height: '600px', backgroundColor: SCENE.DEFAULT_BACKGROUND_COLOR }}>
          <FPSCounter position="top-right" />
          <ErrorBoundary
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-red-900 bg-opacity-50">
                <div className="text-white text-center">
                  <p className="text-xl font-bold mb-2">3D Rendering Error</p>
                  <p className="text-sm">The 3D scene failed to render. Check the console for details.</p>
                </div>
              </div>
            }
          >
            <Canvas 
          camera={{ 
            position: CAMERA.DEFAULT_POSITION, 
            fov: CAMERA.DEFAULT_FOV, 
            near: CAMERA.DEFAULT_NEAR, 
            far: CAMERA.DEFAULT_FAR 
          }}
          gl={{ alpha: true, preserveDrawingBuffer: true }}
          onCreated={({ scene }) => {
            logger.debug('[GamePlayer] Canvas created, setting background to sky blue');
            scene.background = new THREE.Color(SCENE.DEFAULT_BACKGROUND_COLOR);
          }}
        >
          <ambientLight intensity={LIGHTING.AMBIENT_INTENSITY} />
          <pointLight position={LIGHTING.POINT_LIGHT_POSITION} intensity={LIGHTING.POINT_LIGHT_INTENSITY} />
          <directionalLight position={LIGHTING.DIRECTIONAL_LIGHT_1_POSITION} intensity={LIGHTING.DIRECTIONAL_LIGHT_1_INTENSITY} />
          <directionalLight position={LIGHTING.DIRECTIONAL_LIGHT_2_POSITION} intensity={LIGHTING.DIRECTIONAL_LIGHT_2_INTENSITY} />
          <hemisphereLight intensity={LIGHTING.HEMISPHERE_LIGHT_INTENSITY} />
          <Grid
            args={[SCENE.GRID_SIZE, SCENE.GRID_SIZE]}
            cellSize={SCENE.GRID_CELL_SIZE}
            cellColor={SCENE.GRID_CELL_COLOR}
            sectionColor={SCENE.GRID_SECTION_COLOR}
            position={SCENE.GRID_POSITION}
          />
          {scene && (
            <GameScene scene={scene} keys={keys} />
          )}
            </Canvas>
          </ErrorBoundary>
        </div>
        <div className="mt-4 text-white text-sm text-center">
          <p>Use Arrow Keys or WASD to move (W/Up = Forward, S/Down = Backward)</p>
          <p className="text-gray-400">Press Space to jump</p>
        </div>
      </div>
    </ErrorBoundary>
  );
}

// Sky dome - a 3D object that acts as the sky
function SkyDome() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useEffect(() => {
    logger.debug('[SkyDome] Sky dome component mounted and rendering');
    if (meshRef.current) {
      logger.debug('[SkyDome] Mesh created:', {
        position: meshRef.current.position,
        scale: meshRef.current.scale,
        visible: meshRef.current.visible,
        material: meshRef.current.material,
      });
      meshRef.current.frustumCulled = false;
    }
  }, []);
  
  useFrame(() => {
    // Ensure the sky dome is always visible
    if (meshRef.current) {
      meshRef.current.visible = true;
    }
  });
  
  useEffect(() => {
    if (meshRef.current) {
      // Mark this as the sky dome for debugging
      meshRef.current.userData.isSkyDome = true;
      meshRef.current.name = 'SkyDome';
    }
  }, []);
  
  return (
    <mesh 
      ref={meshRef}
      position={[0, 0, 0]} 
      scale={[RENDERING.SKY_DOME_SCALE, RENDERING.SKY_DOME_SCALE, RENDERING.SKY_DOME_SCALE]}
      renderOrder={-10000} // Very low render order to render FIRST (before everything else)
      frustumCulled={false}
      userData={{ isSkyDome: true }}
      name="SkyDome"
    >
      <sphereGeometry args={[1, RENDERING.SKY_DOME_SEGMENTS * 2, RENDERING.SKY_DOME_SEGMENTS]} />
      <meshBasicMaterial 
        color={SCENE.DEFAULT_BACKGROUND_COLOR} 
        side={THREE.BackSide} 
        depthWrite={false}
        depthTest={true} // Enable depth test but write false - renders behind everything
        fog={false}
        transparent={false}
      />
    </mesh>
  );
}

const GameScene = memo(function GameScene({ scene, keys }: { scene: { game_objects?: GameObject[]; background_color?: string }; keys: KeyState }) {
  const { scene: threeScene, camera } = useThree();
  const skyBlueColor = useRef(new THREE.Color(SCENE.DEFAULT_BACKGROUND_COLOR));
  const checkCount = useRef(0);
  const skyDomeRef = useRef<THREE.Mesh>(null);
  const characterPositionRef = useRef<THREE.Vector3 | null>(null);
  
  useEffect(() => {
    logger.debug('[GameScene] Component mounted, setting background to sky blue');
    threeScene.background = new THREE.Color(SCENE.DEFAULT_BACKGROUND_COLOR);
    
    if (scene?.background_color) {
      logger.debug('[GameScene] Scene has background_color in DB:', scene.background_color, '- using sky blue instead');
    }
    
    // Check if sky dome is in the scene (debug only)
    if (logger.isDevelopment) {
      setTimeout(() => {
        const skyDome = threeScene.children.find((child: any) => child.userData?.isSkyDome);
        logger.group('🌌 SKY DOME CHECK', () => {
          logger.debug(`In scene: ${skyDome ? '✅ YES' : '❌ NO'}`);
          logger.debug(`Total scene children: ${threeScene.children.length}`);
          logger.debug(`Scene background: ${threeScene.background ? (threeScene.background instanceof THREE.Color ? `Color(${threeScene.background.getHexString()})` : typeof threeScene.background) : 'null'}`);
          
          if (skyDome) {
            logger.debug(`Sky dome position: (${skyDome.position.x}, ${skyDome.position.y}, ${skyDome.position.z})`);
            logger.debug(`Sky dome scale: (${skyDome.scale.x}, ${skyDome.scale.y}, ${skyDome.scale.z})`);
            logger.debug(`Sky dome visible: ${skyDome.visible}`);
            logger.debug(`Sky dome material: ${skyDome.material ? skyDome.material.type : 'none'}`);
            if (skyDome.material) {
              logger.debug(`Sky dome color: ${skyDome.material.color ? skyDome.material.color.getHexString() : 'none'}`);
            }
          }
        });
      }, 500);
    }
  }, [threeScene, scene]);
  
  useFrame(() => {
    // Ensure background stays sky blue
    checkCount.current++;
    const currentBg = threeScene.background;
    const skyBlue = skyBlueColor.current;
    
    // If background is not sky blue, set it
    if (!(currentBg instanceof THREE.Color) || currentBg.getHex() !== skyBlue.getHex()) {
      threeScene.background = skyBlue;
      if (checkCount.current % 300 === 0) { // Log every 5 seconds (60fps * 5) to avoid spam
        logger.debug(`[GameScene] Frame ${checkCount.current}: Background reset to sky blue`);
      }
    }
  });
  
  // Debug: Comprehensive scene analysis (development only)
  useEffect(() => {
    if (scene?.game_objects && process.env.NODE_ENV === 'development') {
      logger.group('📊 SCENE ANALYSIS', () => {
        logger.debug(`Total objects: ${scene.game_objects.length}`);
        logger.debug(`Background color from DB: ${scene.background_color || 'none'}`);
      
      const objectsByType: { [key: string]: any[] } = {};
      scene.game_objects.forEach((obj: any) => {
        const type = obj.type || 'unknown';
        if (!objectsByType[type]) objectsByType[type] = [];
        objectsByType[type].push(obj);
      });
      
        logger.debug(`\n📦 Objects by type:`);
        Object.entries(objectsByType).forEach(([type, objs]) => {
          logger.debug(`  ${type}: ${objs.length} object(s)`);
          objs.forEach(obj => {
          const props = typeof obj.properties === 'string' 
            ? JSON.parse(obj.properties || '{}') 
            : (obj.properties || {});
          const color = obj.color || props.color || props.sprite_data?.color || '#6B7280';
          const size = props.size || { width: 100, height: 100 };
          const isPlatform = obj.type === 'platform' || props.shape === 'plane';
          const width = isPlatform ? (size.width || 1000) : (typeof size === 'number' ? size : size.width || 100);
          const height = isPlatform ? (size.height || 50) : (typeof size === 'number' ? size : size.height || 100);
          
          // Calculate 3D position for platforms
          const defaultX = 500;
          const defaultY = 300;
          const posX = (obj.position_x === 0 || obj.position_x == null) ? defaultX : obj.position_x;
          const posY = (obj.position_y === 0 || obj.position_y == null) ? defaultY : obj.position_y;
          const pos3D = {
            x: (posX / 100) - 5,
            y: -(posY / 100) + 3,
            z: obj.position_z || 0,
          };
          const size3D = {
            width: isPlatform ? (width / 100) : (typeof size === 'number' ? size / 100 : (size.width || 100) / 100),
            height: isPlatform ? (height / 100) : (typeof size === 'number' ? size / 100 : (size.height || 100) / 100),
          };
          
            logger.debug(`    - "${obj.name}"`);
            logger.debug(`      Color: ${color}`);
            logger.debug(`      Size: ${width}x${height}px (${size3D.width.toFixed(2)}x${size3D.height.toFixed(2)} units in 3D)`);
            logger.debug(`      Position (pixels): (${obj.position_x || 500}, ${obj.position_y || 300}, ${obj.position_z || 0})`);
            logger.debug(`      Position (3D): (${pos3D.x.toFixed(2)}, ${pos3D.y.toFixed(2)}, ${pos3D.z.toFixed(2)})`);
            if (isPlatform) {
              logger.debug(`      ⚠️  This is a PLATFORM - could be covering the sky if large!`);
              logger.debug(`      Camera is at (0, 5, 10) - platform at Y=${pos3D.y.toFixed(2)}`);
              if (size3D.width > 10 || size3D.height > 10) {
                logger.debug(`      ⚠️  Platform is VERY LARGE (${size3D.width.toFixed(1)}x${size3D.height.toFixed(1)} units) - this will cover the entire view!`);
              }
            }
          });
        });
        
        // Check for large green objects
        const largeGreenObjects = scene.game_objects.filter((obj: any) => {
        const props = typeof obj.properties === 'string' 
          ? JSON.parse(obj.properties || '{}') 
          : (obj.properties || {});
        const color = obj.color || props.color || props.sprite_data?.color || '#6B7280';
        const isGreen = color.toLowerCase().includes('green') || color === '#00ff00' || color === '#008000';
        const isPlatform = obj.type === 'platform' || props.shape === 'plane';
        const size = props.size || { width: 100, height: 100 };
        const width = isPlatform ? (size.width || 1000) : (typeof size === 'number' ? size : size.width || 100);
        const isLarge = width > 500;
        return isGreen && isLarge;
      });
      
        if (largeGreenObjects.length > 0) {
          logger.warn('\n⚠️  LARGE GREEN OBJECTS DETECTED (could be blocking sky):');
          largeGreenObjects.forEach((obj: any) => {
            const props = typeof obj.properties === 'string' 
              ? JSON.parse(obj.properties || '{}') 
              : (obj.properties || {});
            const size = props.size || { width: 100, height: 100 };
            const defaultX = 500;
            const defaultY = 300;
            const posX = (obj.position_x === 0 || obj.position_x == null) ? defaultX : obj.position_x;
            const posY = (obj.position_y === 0 || obj.position_y == null) ? defaultY : obj.position_y;
            const pos3D = {
              x: (posX / 100) - 5,
              y: -(posY / 100) + 3,
              z: obj.position_z || 0,
            };
            const width3D = (size.width || 1000) / 100;
            const height3D = (size.height || 50) / 100;
            logger.warn(`  - "${obj.name}":`);
            logger.warn(`    Size: ${size.width || 1000}x${size.height || 50}px (${width3D.toFixed(1)}x${height3D.toFixed(1)} units)`);
            logger.warn(`    3D Position: (${pos3D.x.toFixed(2)}, ${pos3D.y.toFixed(2)}, ${pos3D.z.toFixed(2)})`);
            logger.warn(`    Camera: (0, 5, 10) - Platform Y: ${pos3D.y.toFixed(2)}`);
            logger.warn(`    ⚠️  This huge green platform is blocking the sky dome!`);
          });
        }
      });
    }
  }, [scene]);
  
  // Camera follow logic - update camera to follow character
  useFrame((state, delta) => {
    if (characterPositionRef.current) {
      const charPos = characterPositionRef.current;
      // Camera follows character with offset: behind and above
      const cameraOffset = new THREE.Vector3(...CAMERA.FOLLOW_OFFSET);
      const targetPosition = new THREE.Vector3().copy(charPos).add(cameraOffset);
      
      // Smooth camera movement
      camera.position.lerp(targetPosition, delta * CAMERA.FOLLOW_LERP_SPEED);
      // Camera looks at character
      camera.lookAt(charPos);
    }
  });

  return (
    <>
      {/* No SkyDome needed - using scene.background instead which always renders behind everything */}
      {/* Render game objects with frustum culling */}
      {scene.game_objects?.map((obj: any) => (
        <FrustumCulledObject
          key={obj.id}
          object={obj}
          keys={keys}
          camera={camera}
          onPositionUpdate={obj.type === 'character' ? (pos) => {
            characterPositionRef.current = pos;
          } : undefined}
        />
      ))}
    </>
  );
});

// Frustum culling wrapper - only renders GameObject if it's in the camera's view
const FrustumCulledObject = memo(function FrustumCulledObject({ 
  object, 
  keys, 
  camera, 
  onPositionUpdate 
}: { 
  object: GameObject; 
  keys: KeyState; 
  camera: THREE.Camera;
  onPositionUpdate?: (pos: THREE.Vector3) => void;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const boundingBox = useMemo(() => new THREE.Box3(), []);
  const objectPosition = useRef(new THREE.Vector3());
  
  useFrame(() => {
    // Update object position from database
    const posX = object.position_x || 0;
    const posY = object.position_y || 0;
    const posZ = object.position_z || 0;
    objectPosition.current.set(
      (posX / 100) - 5,
      -(posY / 100) + 3,
      posZ || 0
    );
    
    // Get object size for bounding box
    const properties = typeof object.properties === 'string' 
      ? JSON.parse(object.properties || '{}')
      : (object.properties || {});
    
    const isPlatform = object.type === 'platform' || properties.shape === 'plane';
    let size: number;
    if (isPlatform) {
      const baseWidthPx = properties.size?.width ?? 1000;
      const baseHeightPx = properties.size?.height ?? 50;
      size = Math.max(baseWidthPx / 100, baseHeightPx / 100);
    } else {
      size = properties.size
        ? (typeof properties.size === 'number' ? properties.size / 100 : (properties.size.width || 50) / 100)
        : (object.scale_x || 1);
    }
    
    // Create bounding box around object
    boundingBox.setFromCenterAndSize(objectPosition.current, new THREE.Vector3(size, size, size));
    
    // Update frustum from camera
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
    
    // Check if bounding box intersects frustum
    const visible = frustum.intersectsBox(boundingBox);
    setIsVisible(visible);
  });
  
  // Always render characters (they're important)
  if (object.type === 'character') {
    return (
      <GameObject
        object={object}
        keys={keys}
        onPositionUpdate={onPositionUpdate}
      />
    );
  }
  
  // Only render if visible
  if (!isVisible) {
    return null;
  }
  
  return (
    <GameObject
      object={object}
      keys={keys}
      onPositionUpdate={onPositionUpdate}
    />
  );
});

const GameObject = memo(function GameObject({ object, keys, onPositionUpdate }: { object: GameObject; keys: KeyState; onPositionUpdate?: (pos: THREE.Vector3) => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const velocityRef = useRef({ x: 0, y: 0, z: 0 });
  const isGroundedRef = useRef(false);
  // Parse properties FIRST (before using it)
  const properties = typeof object.properties === 'string'
    ? JSON.parse(object.properties || '{}')
    : (object.properties || {});
  
  // Check if there's a manual animation state override (e.g., "stop")
  const manualAnimationState = properties.animationState;
  const isAnimationStopped = manualAnimationState === null || manualAnimationState === 'stop' || manualAnimationState === 'none';
  
  // Initialize animation state from properties if set, otherwise default to 'idle'
  // This ensures that if the character has 'walk' set in properties, it starts with walk animation
  const initialAnimationState = (manualAnimationState && !isAnimationStopped) 
    ? (manualAnimationState as 'idle' | 'walk' | 'run' | 'jump' | 'fall')
    : 'idle';
  const [animationState, setAnimationState] = useState<'idle' | 'walk' | 'run' | 'jump' | 'fall' | null>(initialAnimationState);
  const lastMoveStateRef = useRef({ wasMoving: false, wasJumping: false, wasFalling: false });
  // Default center position: (500, 300) in pixels = (0, 0) in 3D
  // Treat (0, 0) as center for backward compatibility
  const defaultX = 500;
  const defaultY = 300;
  const posX = (object.position_x === 0 || object.position_x == null) ? defaultX : object.position_x;
  const posY = (object.position_y === 0 || object.position_y == null) ? defaultY : object.position_y;
  const positionRef = useRef({
    x: (posX / 100) - 5,
    y: -(posY / 100) + 3,
    z: object.position_z || 0,
  });

  // Get color from multiple possible locations
  const color = object.color
    || properties.color
    || properties.sprite_data?.color
    || '#6B7280';

  // Convert pixel coordinates to 3D coordinates (same as editor)
  const position = [
    positionRef.current.x,
    positionRef.current.y,
    positionRef.current.z,
  ] as [number, number, number];

  // Get scale/size from properties or use defaults
  const isPlatform = object.type === 'platform' || properties.shape === 'plane';
  let scale: [number, number, number];
  let scaleValue: number; // For physics calculations
  
  if (isPlatform) {
    const baseWidthPx = properties.size?.width ?? 1000;
    const baseHeightPx = properties.size?.height ?? 50;
    // No size limit - let platforms be as large as needed to cover the grid
    const scaleX = baseWidthPx / 100;
    const scaleY = baseHeightPx / 100;
    scale = [scaleX, scaleY, 1];
    // For platforms, use average scale for physics
    scaleValue = (scaleX + scaleY) / 2;
  } else {
    scaleValue = properties.size
      ? (typeof properties.size === 'number' ? properties.size / 100 : (properties.size.width || 50) / 100)
      : (object.scale_x || 1);
    scale = [scaleValue, scaleValue, scaleValue];
  }

  // Get rotation from properties (in degrees, convert to radians)
  const rotationFromProps = properties.rotation || {};
  const rotation: [number, number, number] = [
    ((rotationFromProps.x || 0) * Math.PI) / 180,
    ((rotationFromProps.y || 0) * Math.PI) / 180,
    ((rotationFromProps.z || 0) * Math.PI) / 180,
  ];

  // Determine shape from properties
  const shape = properties.shape || properties.sprite_data?.shape || (properties.model_url ? 'model' : 'box');
  const modelUrl = properties.model_url || properties.sprite_data?.model_url;
  const isCharacter = object.type === 'character';
  
  // Debug logging
  logger.debug('[GamePlayer] Rendering object:', {
    name: object.name,
    type: object.type,
    shape,
    modelUrl,
    isCharacter,
    properties: properties,
  });

  // Parse logic blocks
  const logicBlocks = object.logic_blocks || [];
  const hasMovementLogic = logicBlocks.some((block: any) => {
    const blockData = typeof block.block_data === 'string'
      ? JSON.parse(block.block_data || '{}')
      : (block.block_data || {});
    return block.block_type === 'on_key_press' || 
           block.block_type === 'move' ||
           block.category === 'movement' ||
           block.category === 'input' ||
           block.category === 'event';
  });

  // Debug: Log logic blocks for this object
  if (logicBlocks.length > 0) {
    logger.debug(`Object "${object.name}" has ${logicBlocks.length} logic blocks:`, logicBlocks);
  }

  // Physics simulation (simple gravity and movement)
  const hasInitializedPosition = useRef(false);
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Enable physics if object has physics enabled OR has movement logic blocks
    const shouldHavePhysics = object.has_physics || hasMovementLogic || isCharacter;

    // Initialize position on first frame for physics objects
    if (shouldHavePhysics && !hasInitializedPosition.current) {
      // For characters, position is already at torso center from database
      // For other objects, use the position as-is
      meshRef.current.position.set(position[0], position[1], position[2]);
      positionRef.current.x = position[0];
      positionRef.current.y = position[1];
      positionRef.current.z = position[2];
      hasInitializedPosition.current = true;
      
      // Check if object starts on the ground
      // IMPORTANT: For characters, meshRef position IS at the feet (model pivot is at feet)
      const groundY = PHYSICS.GROUND_Y;
      if (isCharacter) {
        // For characters, position is already at feet (no offset needed)
        const feetY = position[1];
        isGroundedRef.current = feetY <= groundY + PHYSICS.GROUND_TOLERANCE;
        // If character starts above ground, make sure it's not grounded so it falls
        if (feetY > groundY + PHYSICS.GROUND_TOLERANCE) {
          isGroundedRef.current = false;
          logger.debug(`[GamePlayer] Character "${object.name}" starts above ground (feet at ${feetY.toFixed(2)}, ground at ${groundY}), will fall`);
        }
      } else {
        // For other objects, assume pivot is at center
        const bottomY = position[1] - scaleValue / 2;
        isGroundedRef.current = bottomY <= groundY + PHYSICS.GROUND_TOLERANCE;
        // If object starts above ground, make sure it's not grounded so it falls
        if (bottomY > groundY + PHYSICS.GROUND_TOLERANCE) {
          isGroundedRef.current = false;
          logger.debug(`[GamePlayer] Object "${object.name}" starts above ground (bottom at ${bottomY.toFixed(2)}, ground at ${groundY}), will fall`);
        }
      }
    }

    if (shouldHavePhysics) {
      // Simple gravity - always apply if not grounded
      if (!isGroundedRef.current) {
        velocityRef.current.y -= PHYSICS.GRAVITY * delta;
        // Clamp to terminal velocity
        if (velocityRef.current.y < -PHYSICS.TERMINAL_VELOCITY) {
          velocityRef.current.y = -PHYSICS.TERMINAL_VELOCITY;
        }
        // Debug: log falling state
        if (isCharacter && Math.abs(velocityRef.current.y) > 0.1) {
          logger.debug(`[GamePlayer] Character "${object.name}" falling: velocity.y=${velocityRef.current.y.toFixed(2)}, position.y=${meshRef.current.position.y.toFixed(2)}`);
        }
      }

      // Ground collision (simple check)
      // Ground is at Y=-2 (platform level)
      // IMPORTANT: Most 3D character models have their pivot at the FEET (bottom)
      // So meshRef.position.y IS the feet position for characters
      // For other objects, assume pivot is at center
      const groundY = PHYSICS.GROUND_Y;
      let objectBottomY: number;
      
      if (isCharacter) {
        // For characters, meshRef position IS at the feet (model pivot is at feet)
        // No offset needed - the position is already the feet position
        objectBottomY = meshRef.current.position.y;
      } else {
        // For other objects, assume pivot is at center
        objectBottomY = meshRef.current.position.y - scaleValue / 2;
      }
      
      if (objectBottomY <= groundY + PHYSICS.GROUND_TOLERANCE) {
        // Object hit the ground - position it so bottom touches ground
        if (isCharacter) {
          // For characters, position is at feet, so set directly to ground level
          meshRef.current.position.y = groundY;
        } else {
          // For other objects, set center position so bottom touches ground
          meshRef.current.position.y = groundY + scaleValue / 2;
        }
        velocityRef.current.y = 0;
        isGroundedRef.current = true;
      } else {
        isGroundedRef.current = false;
      }

      // Execute logic blocks for movement
      let moveX = 0;
      let moveY = 0;
      let moveZ = 0;
      const moveSpeed = PHYSICS.MOVE_SPEED;
      const jumpForce = PHYSICS.JUMP_FORCE;

      // Process logic blocks
      logicBlocks.forEach((block: any) => {
        const blockData = typeof block.block_data === 'string'
          ? JSON.parse(block.block_data || '{}')
          : (block.block_data || {});

        // Handle key press events
        if (block.block_type === 'on_key_press' || block.category === 'input' || block.category === 'event') {
          const key = blockData.key || blockData.parameter?.key || blockData.direction || 'SPACE';
          const action = blockData.action || blockData.parameter?.action || '';

          // Map key names to our key state
          const keyMap: { [key: string]: string } = {
            'UP': 'arrowup',
            'DOWN': 'arrowdown',
            'LEFT': 'arrowleft',
            'RIGHT': 'arrowright',
            'SPACE': ' ',
            'W': 'w',
            'A': 'a',
            'S': 's',
            'D': 'd',
            'ARROWUP': 'arrowup',
            'ARROWDOWN': 'arrowdown',
            'ARROWLEFT': 'arrowleft',
            'ARROWRIGHT': 'arrowright',
          };

          const keyName = keyMap[key.toUpperCase()] || key.toLowerCase();
          const isPressed = keys[keyName] || keys[key.toLowerCase()];

          if (isPressed) {
                // Handle movement based on key or action
                if (action === 'move_up' || key === 'UP' || key === 'ArrowUp' || key === 'ARROWUP') {
                  // Forward movement (negative Z in Three.js)
                  moveZ = -moveSpeed * delta;
                } else if (action === 'move_down' || key === 'DOWN' || key === 'ArrowDown' || key === 'ARROWDOWN') {
                  // Backward movement (positive Z in Three.js)
                  moveZ = moveSpeed * delta;
                } else if (action === 'move_left' || key === 'LEFT' || key === 'ArrowLeft' || key === 'ARROWLEFT') {
                  moveX = -moveSpeed * delta;
                } else if (action === 'move_right' || key === 'RIGHT' || key === 'ArrowRight' || key === 'ARROWRIGHT') {
                  moveX = moveSpeed * delta;
                } else if (action === 'jump' || key === 'SPACE' || key === ' ') {
                  if (isGroundedRef.current) {
                    velocityRef.current.y = jumpForce;
                    isGroundedRef.current = false;
                  }
                }
          }
        }

        // Handle movement blocks
        if (block.block_type === 'move' || block.category === 'movement') {
          const direction = blockData.direction || blockData.parameter?.direction || '';
          const distance = blockData.distance || blockData.parameter?.distance || 5;

          if (direction === 'up' || direction === 'UP') {
            // Forward movement (negative Z in Three.js)
            moveZ = -(distance / 100) * delta;
          } else if (direction === 'down' || direction === 'DOWN') {
            // Backward movement (positive Z in Three.js)
            moveZ = (distance / 100) * delta;
          } else if (direction === 'left' || direction === 'LEFT') {
            moveX = -(distance / 100) * delta;
          } else if (direction === 'right' || direction === 'RIGHT') {
            moveX = (distance / 100) * delta;
          }
        }
      });

      // Fallback: Default keyboard controls if no logic blocks but is a character
      if (!hasMovementLogic && isCharacter) {
        // Horizontal movement (left/right)
        if (keys['arrowleft'] || keys['a']) {
          moveX = -moveSpeed * delta;
        } else if (keys['arrowright'] || keys['d']) {
          moveX = moveSpeed * delta;
        }
        
        // Forward/backward movement (up/down or W/S)
        if (keys['arrowup'] || keys['w']) {
          moveZ = -moveSpeed * delta; // Negative Z is forward in Three.js
        } else if (keys['arrowdown'] || keys['s']) {
          moveZ = moveSpeed * delta; // Positive Z is backward
        }

        // Jump (only if not using arrow up for forward movement)
        if (keys[' '] && isGroundedRef.current) {
          velocityRef.current.y = jumpForce;
          isGroundedRef.current = false;
        }
      }

      // Apply horizontal movement directly to position
      // Movement is already in world units (moveSpeed * delta), so apply it directly
      if (moveX !== 0 || moveZ !== 0) {
        meshRef.current.position.x += moveX;
        meshRef.current.position.z += moveZ;
        // Clear horizontal velocity when moving (movement takes priority)
        velocityRef.current.x = 0;
        velocityRef.current.z = 0;
      } else {
        // Apply friction when not moving (gradual stop)
        velocityRef.current.x *= PHYSICS.FRICTION;
        velocityRef.current.z *= PHYSICS.FRICTION;
        // Apply remaining velocity
        meshRef.current.position.x += velocityRef.current.x * delta;
        meshRef.current.position.z += velocityRef.current.z * delta;
      }

      // Apply vertical velocity (for jumping/gravity) - always applied
      meshRef.current.position.y += velocityRef.current.y * delta;

      // Update position ref to match mesh position
      positionRef.current.x = meshRef.current.position.x;
      positionRef.current.y = meshRef.current.position.y;
      positionRef.current.z = meshRef.current.position.z;
      
      // Notify parent of position update for camera following (only once per frame)
      if (onPositionUpdate && meshRef.current) {
        onPositionUpdate(meshRef.current.position);
      }

      // Calculate movement state (always, for tracking)
      // Check both moveX/moveZ and velocity to detect actual movement
      const isMoving = Math.abs(moveX) > MOVEMENT.MIN_MOVE_THRESHOLD || Math.abs(moveZ) > MOVEMENT.MIN_MOVE_THRESHOLD || 
                       Math.abs(velocityRef.current.x) > MOVEMENT.MIN_VELOCITY_THRESHOLD || Math.abs(velocityRef.current.z) > MOVEMENT.MIN_VELOCITY_THRESHOLD;
      const isJumping = velocityRef.current.y > MOVEMENT.JUMP_VELOCITY_THRESHOLD;
      const isFalling = !isGroundedRef.current && velocityRef.current.y < MOVEMENT.FALL_VELOCITY_THRESHOLD;
      
      // Update animation state based on movement (only if not manually stopped)
      // If manualAnimationState is set and not 'stop', use it; otherwise use movement-based state
      if (!isAnimationStopped) {
        // Priority: jump > fall > walk (if moving) > idle (if not moving)
        if (isJumping) {
          if (!lastMoveStateRef.current.wasJumping) {
            setAnimationState('jump');
          }
        } else if (isFalling) {
          if (!lastMoveStateRef.current.wasFalling) {
            setAnimationState('fall');
          }
        } else if (isMoving) {
          // Always set to walk when moving (not just on state change)
          // This ensures the animation updates even if manualAnimationState was set
          setAnimationState('walk');
        } else if (isGroundedRef.current && !isMoving) {
          // Set to idle when stopped and grounded
          // Only change if we were moving before, or if we want to reset to idle
          if (lastMoveStateRef.current.wasMoving || animationState === 'walk') {
            setAnimationState('idle');
          }
        }
      } else {
        // If manually stopped, keep it stopped
        setAnimationState(null);
      }
      
      lastMoveStateRef.current = {
        wasMoving: isMoving,
        wasJumping: isJumping,
        wasFalling: isFalling,
      };
    }

    // Apply base rotation from properties (but NOT for platforms - they have special rotation)
    // Platforms have their rotation set in JSX and should not be overridden here
    if (meshRef.current && !isPlatform && shape !== 'plane') {
      if (properties.animate) {
        // Apply base rotation and add animation
        meshRef.current.rotation.set(rotation[0], rotation[1] + (state.clock.elapsedTime * 0.01), rotation[2]);
      } else {
        // Just apply base rotation
        meshRef.current.rotation.set(rotation[0], rotation[1], rotation[2]);
      }
    }
  });

  // Render platforms/planes - MUST lay flat on the ground
  if (isPlatform || shape === 'plane') {
    // For platforms, ensure they're at ground level (negative Y)
    // Ground level is Y=-2 in 3D coordinates
    const platformPosition: [number, number, number] = [position[0], PHYSICS.GROUND_Y, position[2]];
    logger.debug(`[GamePlayer] Platform "${object.name}" at Y=${PHYSICS.GROUND_Y} with rotation X=-90°`);
    
    // Platforms don't have physics, so use position prop
    // Using a group to isolate the mesh from useFrame rotation updates
    // The inner mesh has rotation [-Math.PI/2, 0, 0] to lay flat
    return (
      <group position={platformPosition}>
        <mesh
          rotation={[RENDERING.DEFAULT_PLATFORM_ROTATION, 0, 0]}
          scale={scale}
          renderOrder={0}
        >
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    );
  }

  // Render based on shape
  if (object.type === 'collectible' || shape === 'circle' || shape === 'sphere') {
    return (
      <Sphere ref={meshRef} position={position} rotation={rotation} scale={scale[0]}>
        <meshStandardMaterial color={color} />
      </Sphere>
    );
  }

  // Render external model if available
  if (shape === 'model' && modelUrl) {
    const ext = (modelUrl.split('.').pop() || '').toLowerCase();
    const isAnimatedFormat = ext === 'glb' || ext === 'gltf' || ext === 'fbx';
    
    logger.debug('[GamePlayer] Model detected:', { ext, isAnimatedFormat, isCharacter, modelUrl });
    
    // Use AnimatedModel for characters with animation-capable formats
    if (isCharacter && isAnimatedFormat) {
      // Animation state priority:
      // 1. If manually stopped, use null
      // 2. If movement-based state is set (from useFrame), use that (it overrides manual state when moving)
      // 3. Otherwise, use manual state from properties (for initial/default animation)
      // This allows movement-based animations to work while still respecting manual overrides when not moving
      const finalAnimationState = isAnimationStopped 
        ? null 
        : (animationState || manualAnimationState || 'idle');
      logger.debug('[GamePlayer] Rendering animated model:', { 
        finalAnimationState, 
        animationState, 
        manualAnimationState,
        isAnimationStopped,
        playAnimation: !isAnimationStopped 
      });
      // For characters with physics, don't pass position prop - it's controlled by useFrame
      const shouldHavePhysics = object.has_physics || hasMovementLogic || isCharacter;
      
      // IMPORTANT: Most 3D character models have their pivot at the FEET (bottom)
      // So the model's origin (0,0,0) is at the feet
      // meshRef position should be at the FEET position, not torso center
      // For physics calculations, we account for this by checking feet position
      return (
        <group ref={meshRef} position={shouldHavePhysics ? [0, 0, 0] : position}>
          <AnimatedModel
            url={modelUrl}
            position={[0, 0, 0]}
            rotation={rotation}
            scale={scale}
            animationState={finalAnimationState || 'idle'}
            playAnimation={!isAnimationStopped}
          />
        </group>
      );
    }
    
    // Also handle non-animated models for characters (e.g., OBJ, STL, DAE)
    if (isCharacter && !isAnimatedFormat) {
      logger.debug('[GamePlayer] Rendering non-animated model for character');
    }
    
    // Non-animated models
    const shouldHavePhysics = object.has_physics || hasMovementLogic || isCharacter;
    const modelPosition = shouldHavePhysics ? [0, 0, 0] : position;
    function Model() {
      if (ext === 'glb' || ext === 'gltf') {
        const gltf = useGLTF(modelUrl);
        return <primitive ref={meshRef as any} object={gltf.scene} position={modelPosition} rotation={rotation} scale={scale} />;
      }
      // Lazy dynamic loaders to avoid SSR import issues if not installed
      try {
        if (ext === 'obj') {
          const { useLoader } = require('@react-three/fiber');
          const { OBJLoader } = require('three/examples/jsm/loaders/OBJLoader.js');
          const obj = useLoader(OBJLoader, modelUrl);
          return <primitive ref={meshRef as any} object={obj} position={modelPosition} rotation={rotation} scale={scale} />;
        }
        if (ext === 'stl') {
          const { useLoader } = require('@react-three/fiber');
          const { STLLoader } = require('three/examples/jsm/loaders/STLLoader.js');
          const geom = useLoader(STLLoader, modelUrl);
          return (
            <mesh ref={meshRef} position={modelPosition} rotation={rotation} scale={scale}>
              <primitive object={geom} attach="geometry" />
              <meshStandardMaterial color={color} />
            </mesh>
          );
        }
        if (ext === 'fbx') {
          const { useLoader } = require('@react-three/fiber');
          const { FBXLoader } = require('three/examples/jsm/loaders/FBXLoader.js');
          const fbx = useLoader(FBXLoader, modelUrl);
          return <primitive ref={meshRef as any} object={fbx} position={modelPosition} rotation={rotation} scale={scale} />;
        }
        if (ext === 'dae') {
          const { useLoader } = require('@react-three/fiber');
          const { ColladaLoader } = require('three/examples/jsm/loaders/ColladaLoader.js');
          const collada = useLoader(ColladaLoader, modelUrl);
          return <primitive ref={meshRef as any} object={collada.scene} position={modelPosition} rotation={rotation} scale={scale} />;
        }
      } catch (e) {
        // Fallback if loaders unavailable
        logger.warn('Loader not available for', ext, e);
      }
      // Unknown extension: fallback to box
      return (
        <Box ref={meshRef} position={modelPosition} rotation={rotation} scale={scale}>
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

  // Default: render as box (for characters without models, obstacles, etc.)
  logger.debug('[GamePlayer] Rendering default box for:', { name: object.name, type: object.type, shape, modelUrl });
  // For objects with physics, position is controlled by useFrame
  const shouldHavePhysics = object.has_physics || hasMovementLogic || isCharacter;
  return (
    <Box ref={meshRef} position={shouldHavePhysics ? [0, 0, 0] : position} rotation={rotation} scale={scale}>
      <meshStandardMaterial color={color} />
    </Box>
  );
});

