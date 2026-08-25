'use client';

import { forwardRef, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  classifyPart,
  partTransform,
  isAnimating,
  REST,
  type PartKind,
} from '../../lib/models/proceduralAnimation';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { repairMinionMaterials } from '../../lib/models/minionMaterials';
import { modelCache, type CachedModelResource } from '../../lib/utils/modelCache';
import {
  startAsyncResourceLifecycle,
  type AsyncResourceHandlers,
} from '../../lib/utils/asyncResourceLifecycle';
import { logger } from '../../lib/utils/logger';
import { ErrorBoundary } from '../common/ErrorBoundary';
import {
  mountOwnedMaterialScene,
  type OwnedMaterialScene,
} from './modelMaterialOwnership';
import { proceduralMotion } from '../../lib/player/presentationMotion';

interface AnimatedModelProps {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  animationState?: 'idle' | 'walk' | 'run' | 'jump' | 'fall' | string;
  playAnimation?: boolean;
  onAnimationsLoaded?: (animations: string[]) => void;
  onLoad?: () => void;
  onError?: (error: unknown) => void;
  // Forward pointer clicks from the wrapping group so `when_clicked` scripts
  // fire when a kid taps the character mesh itself, not just the invisible
  // volume around it. Without this, click-to-jump silently no-ops on any
  // GLB/FBX character.
  onClick?: (e: any) => void;
  /** Disables decorative fallback movement without affecting the model's parent physics group. */
  reducedMotion?: boolean;
}

export default function AnimatedModel({
  url,
  position,
  rotation,
  scale,
  animationState = 'idle',
  playAnimation = true,
  onAnimationsLoaded,
  onLoad,
  onError,
  onClick,
  reducedMotion = false,
}: AnimatedModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ext = (url.split('.').pop() || '').toLowerCase();
  
  // For GLTF/GLB files, use drei's useAnimations
  if (ext === 'glb' || ext === 'gltf') {
    const model = <GLTFAnimatedModel
      url={url}
      position={position}
      rotation={rotation}
      scale={scale}
      animationState={animationState}
      playAnimation={playAnimation}
      onAnimationsLoaded={onAnimationsLoaded}
      onLoad={onLoad}
      onError={onError}
      onClick={onClick}
      reducedMotion={reducedMotion}
    />;

    if (onError) {
      return (
        <ErrorBoundary key={url} fallback={<></>} onError={(error) => onError(error)}>
          {model}
        </ErrorBoundary>
      );
    }

    return model;
  }
  
  // For FBX files, use manual animation extraction
  if (ext === 'fbx') {
    return <FBXAnimatedModel
      url={url}
      position={position}
      rotation={rotation}
      scale={scale}
      animationState={animationState}
      playAnimation={playAnimation}
      onAnimationsLoaded={onAnimationsLoaded}
      onLoad={onLoad}
      onError={onError}
      onClick={onClick}
      reducedMotion={reducedMotion}
    />;
  }
  
  // For other formats, just render without animation
  return null;
}

function GLTFAnimatedModel({
  url,
  position,
  rotation,
  scale,
  animationState,
  playAnimation,
  onAnimationsLoaded,
  onLoad,
  onError,
  onClick,
  reducedMotion,
}: AnimatedModelProps) {
  const { scene: sourceScene, animations } = useGLTF(url);
  const [committedInstance, setCommittedInstance] = useState<{
    sourceScene: THREE.Group;
    owned: OwnedMaterialScene<THREE.Group>;
  } | null>(null);

  useEffect(() => mountOwnedMaterialScene(sourceScene, (owned) => {
    setCommittedInstance({ sourceScene, owned });
    onLoad?.();
  }), [sourceScene, onLoad]);
  
  useEffect(() => {
    if (animations.length > 0) {
      const animationNames = animations.map((clip) => clip.name);
            logger.info(`[GLTF/GLB Model] Found ${animationNames.length} animation(s):`, animationNames);
      if (onAnimationsLoaded) {
        onAnimationsLoaded(animationNames);
      }
    } else {
      logger.debug('[GLTF/GLB Model] No animations found in this model');
    }
  }, [animations, onAnimationsLoaded]);

  if (!committedInstance || committedInstance.sourceScene !== sourceScene) {
    return null;
  }

  return (
    <GLTFAnimatedModelInstance
      url={url}
      instance={committedInstance.owned.scene}
      animations={animations}
      position={position}
      rotation={rotation}
      scale={scale}
      animationState={animationState}
      playAnimation={playAnimation}
      onClick={onClick}
      reducedMotion={reducedMotion}
    />
  );
}

function GLTFAnimatedModelInstance({
  instance,
  animations,
  position,
  scale,
  animationState,
  playAnimation,
  onClick,
  reducedMotion = false,
}: AnimatedModelProps & {
  instance: THREE.Group;
  animations: THREE.AnimationClip[];
}) {
  const { actions } = useAnimations(animations, instance);
  const groupRef = useRef<THREE.Group>(null);

  // An authored clip only wins when it describes the requested semantic state.
  // A model with an unrelated clip still needs a readable idle/walk/jump/fall
  // fallback rather than playing arbitrary movement.
  const matchingAnimationName = findAnimationName(animationState ?? 'idle', animations.map((clip) => clip.name));
  const hasMatchingClip = Boolean(matchingAnimationName);
  const restPoseRef = useRef<Map<THREE.Object3D, { rot: THREE.Euler; posY: number; kind: PartKind }> | null>(null);

  useEffect(() => {
    if (hasMatchingClip) { restPoseRef.current = null; return; }
    // Capture the rest pose once so offsets are applied on top of it rather
    // than accumulating frame over frame.
    const rest = new Map<THREE.Object3D, { rot: THREE.Euler; posY: number; kind: PartKind }>();
    instance.traverse((child) => {
      if (child === instance) return;
      const kind = classifyPart(child.name);
      if (kind === 'other') return;
      rest.set(child, { rot: child.rotation.clone(), posY: child.position.y, kind });
    });
    restPoseRef.current = rest;
    return () => {
      // Restore the rest pose so a stopped model doesn't freeze mid-stride.
      for (const [node, r] of rest) {
        node.rotation.copy(r.rot);
        node.position.y = r.posY;
      }
      restPoseRef.current = null;
    };
  }, [instance, hasMatchingClip]);

  useFrame((state) => {
    const rest = restPoseRef.current;
    if (!rest) return;
    const active = playAnimation && !reducedMotion && isAnimating(animationState);
    const t = state.clock.elapsedTime;
    for (const [node, r] of rest) {
      const d = active ? partTransform(r.kind, animationState ?? 'idle', t) : REST;
      node.rotation.set(r.rot.x + d.rotationX, r.rot.y + d.rotationY, r.rot.z + d.rotationZ);
      node.position.y = r.posY + d.offsetY;
    }
  });
  
  useEffect(() => {
    if (!actions) return;
    
    // Stop all animations first
    Object.values(actions).forEach((action) => {
      if (action) {
        action.fadeOut(0.2);
        action.stop();
      }
    });
    
    // Handle stop/null animation state
    if (!playAnimation || !animationState || animationState === 'stop' || animationState === 'none') {
      logger.debug('[GLTF/GLB] Stopping all animations (playAnimation:', playAnimation, ', state:', animationState, ')');
      return;
    }
    
    // Try to find matching animation
    if (matchingAnimationName && actions[matchingAnimationName]) {
      const action = actions[matchingAnimationName];
      action.reset().fadeIn(0.2).setLoop(THREE.LoopRepeat, Infinity).play();
      logger.debug(`[GLTF/GLB] Playing animation: "${matchingAnimationName}" (looping)`);
    }
    
    return () => {
      Object.values(actions).forEach((action) => {
        if (action) action.fadeOut(0.2);
      });
    };
  }, [actions, animationState, matchingAnimationName, playAnimation]);
  
  // Rotation is handled by the parent group in SceneView, so we don't apply it here
  // This ensures TransformControls rotates around the correct pivot point
  return (
    <group ref={groupRef} position={position} rotation={[0, 0, 0]} scale={scale} onClick={onClick}>
      <VisualFallbackMotion
        enabled={!hasMatchingClip && Boolean(playAnimation)}
        animationState={animationState}
        reducedMotion={reducedMotion}
      >
        <primitive object={instance} dispose={null} onClick={onClick} />
      </VisualFallbackMotion>
    </group>
  );
}

/**
 * A render-only child wrapper for unanimated assets. Its parent remains the
 * player's physics/touch group, so the procedural transform can never move a
 * collider or alter the runtime world position.
 */
type VisualFallbackMotionProps = {
  enabled: boolean;
  animationState?: string | null;
  reducedMotion: boolean;
  children?: React.ReactNode;
};

const VisualFallbackMotion = forwardRef<THREE.Group, VisualFallbackMotionProps>(function VisualFallbackMotion({
  enabled,
  animationState,
  reducedMotion,
  children,
}, forwardedRef) {
  const visualRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const motion = enabled
      ? proceduralMotion(animationState === 'run' ? 'walk' : (animationState as 'idle' | 'walk' | 'jump' | 'fall'), state.clock.elapsedTime, reducedMotion)
      : proceduralMotion('idle', 0, true);
    visualRef.current?.position.set(0, motion.positionY, 0);
    visualRef.current?.rotation.set(0, 0, motion.rotationZ);
    visualRef.current?.scale.set(1, motion.scaleY, 1);
  });

  return <group ref={(node) => {
    visualRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }}>{children}</group>;
});

function FBXAnimatedModel({
  url,
  position,
  rotation,
  scale,
  animationState,
  playAnimation,
  onAnimationsLoaded,
  onLoad,
  onError,
  onClick,
  reducedMotion = false,
}: AnimatedModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const animationsRef = useRef<THREE.AnimationClip[]>([]);
  const [hasMatchingClip, setHasMatchingClip] = useState(false);
  const loadHandlersRef = useRef<AsyncResourceHandlers<CachedModelResource>>({
    onLoad: () => {},
  });

  loadHandlersRef.current = {
    onLoad: ({ model, animations: cachedAnimations }) => {
      const fbx = model.clone() as THREE.Group;
      repairMinionMaterials(fbx, url);
      const animations = cachedAnimations ? [...cachedAnimations] : [];

      if (!visualRef.current) return;

      while (visualRef.current.children.length > 0) {
        visualRef.current.remove(visualRef.current.children[0]);
      }
      visualRef.current.add(fbx);
      onLoad?.();

      animationsRef.current = animations;
      setHasMatchingClip(Boolean(findAnimationName(animationState ?? 'idle', animations.map((clip) => clip.name))));
      if (animations.length > 0) {
        const animationNames = animations.map((clip: THREE.AnimationClip) => clip.name);
        logger.info(`[FBX Model] Found ${animationNames.length} animation(s):`, animationNames);
        onAnimationsLoaded?.(animationNames);

        // The mixer must be attached to the cloned object that owns the bones.
        mixerRef.current = new THREE.AnimationMixer(fbx);
        logger.debug('[FBX Model] Animation mixer created for FBX root');
      } else {
        mixerRef.current = null;
        logger.warn('[FBX Model] No animations found in this model. Model structure:', {
          hasAnimations: !!fbx.animations,
          animationsLength: fbx.animations?.length || 0,
          children: fbx.children?.length || 0,
        });
      }
    },
    onError: (error) => {
      logger.error('Failed to load FBX:', error);
      onError?.(error);
    },
  };
  
  useEffect(() => {
    animationsRef.current = [];
    mixerRef.current = null;
    setHasMatchingClip(false);

    const stopLifecycle = startAsyncResourceLifecycle(
      () => modelCache.acquire(url, async () => {
        logger.debug('[FBXAnimatedModel] Loading FBX from URL:', url);
        const loader = new FBXLoader();
        const fbx = await new Promise<THREE.Group>((resolve, reject) => {
          loader.load(
            url,
            (object: THREE.Group) => resolve(object),
            undefined,
            (error: unknown) => reject(error),
          );
        });

        return {
          model: fbx,
          animations: fbx.animations?.length > 0 ? fbx.animations : [],
        };
      }),
      loadHandlersRef,
    );

    return () => {
      stopLifecycle();
      currentActionRef.current?.stop();
      currentActionRef.current = null;
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
    };
  }, [url]);
  
  const lastAnimationStateRef = useRef<string | null>(null);
  
  useEffect(() => {
    const animationName = findAnimationName(animationState ?? 'idle', animationsRef.current.map((clip) => clip.name));
    setHasMatchingClip(Boolean(animationName));

    if (!playAnimation) {
      logger.debug('[FBX] Animation playback disabled');
      // Stop any running animation
      if (currentActionRef.current) {
        try {
          currentActionRef.current.fadeOut(0.1);
          currentActionRef.current.stop();
        } catch (e) {
          // Ignore errors
        }
        currentActionRef.current = null;
      }
      return;
    }
    
    if (!mixerRef.current) {
      logger.warn('[FBX] No animation mixer available');
      return;
    }
    
    if (animationsRef.current.length === 0) {
      logger.warn('[FBX] No animations available');
      return;
    }
    
    // Handle stop/null animation state
    if (!animationState || animationState === 'stop' || animationState === 'none') {
      logger.debug('[FBX] Stopping animation (state:', animationState, ')');
      if (currentActionRef.current) {
        try {
          currentActionRef.current.fadeOut(0.2);
          currentActionRef.current.stop();
          logger.debug('[FBX] Animation stopped');
        } catch (e) {
          logger.warn('[FBX] Error stopping animation:', e);
        }
        currentActionRef.current = null;
      }
      lastAnimationStateRef.current = null;
      return;
    }
    
    // Only change animation if state actually changed
    if (lastAnimationStateRef.current === animationState && currentActionRef.current?.isRunning()) {
      return; // Animation already playing, don't restart
    }
    
    lastAnimationStateRef.current = animationState;
    
    logger.debug(`[FBX] Attempting to play animation state: "${animationState}"`);
    logger.debug(`[FBX] Available animations:`, animationsRef.current.map((clip) => clip.name));
    
    // Stop current animation
    if (currentActionRef.current) {
      try {
        currentActionRef.current.fadeOut(0.1);
        currentActionRef.current.stop();
      } catch (e) {
        logger.warn('[FBX] Error stopping previous action:', e);
      }
      currentActionRef.current = null;
    }
    
    // Find only a semantic match. An unrelated authored clip is not a fallback.
    logger.debug(`[FBX] Matched animation name: "${animationName}"`);
    
    const clip = animationsRef.current.find((candidate) => candidate.name === animationName);
    
    if (clip && mixerRef.current) {
      // Create new action (don't reuse existing actions to avoid binding issues)
      let action: THREE.AnimationAction | null = null;
      try {
        action = mixerRef.current.clipAction(clip, mixerRef.current.getRoot());
        if (!action) {
          logger.error('[FBX] Failed to create animation action for clip:', clip.name);
          return;
        }
      } catch (error) {
        logger.error('[FBX] Error creating animation action:', error);
        return;
      }
      
      // Ensure animation is properly set up
      try {
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.setEffectiveTimeScale(1.0); // Normal speed
        action.setEffectiveWeight(1.0); // Full weight
        action.clampWhenFinished = false; // Don't clamp at end
        action.play();
        currentActionRef.current = action;
      } catch (error) {
        logger.error('[FBX] Error setting up animation action:', error);
        return;
      }
      
      logger.debug(`[FBX] ✓ Playing animation: "${clip.name}" (looping, duration: ${clip.duration}s, timeScale: 1.0)`);
      logger.debug(`[FBX] Action state:`, {
        isRunning: action.isRunning(),
        enabled: action.enabled,
        paused: action.paused,
        time: action.time,
        timeScale: action.getEffectiveTimeScale(),
        weight: action.getEffectiveWeight()
      });
      
      // Verify the action is actually playing after a short delay
      setTimeout(() => {
        if (action && action.isRunning()) {
          logger.debug(`[FBX] ✓ Animation "${clip.name}" confirmed running at time: ${action.time.toFixed(2)}s`);
        } else {
          logger.warn(`[FBX] ⚠ Animation "${clip.name}" is not running! State:`, {
            isRunning: action?.isRunning(),
            enabled: action?.enabled,
            paused: action?.paused
          });
        }
      }, 100);
    } else {
      logger.error('[FBX] Failed to create or play animation action - clip or mixer missing');
    }
    
    return () => {
      // Don't stop animation on cleanup if we're just changing states
      // Only stop if component is unmounting
    };
  }, [animationState, hasMatchingClip, playAnimation]);
  
  useFrame((state, delta) => {
    if (mixerRef.current) {
      try {
        mixerRef.current.update(delta);
        // Debug: log if animation is playing (less frequently)
        if (currentActionRef.current) {
          try {
            if (currentActionRef.current.isRunning()) {
              // Only log occasionally to avoid spam (every ~5 seconds)
              if (Math.random() < 0.002) {
                const action = currentActionRef.current;
                logger.debug(`[FBX] Animation status:`, {
                  name: action.getClip().name,
                  time: action.time.toFixed(2),
                  duration: action.getClip().duration.toFixed(2),
                  isRunning: action.isRunning(),
                  weight: action.getEffectiveWeight().toFixed(2)
                });
              }
            } else {
              // Log if animation should be running but isn't
              if (Math.random() < 0.01) {
                logger.warn('[FBX] Animation action exists but is not running:', {
                  enabled: currentActionRef.current.enabled,
                  paused: currentActionRef.current.paused,
                  time: currentActionRef.current.time
                });
              }
            }
          } catch (e) {
            // Ignore errors when checking action state
          }
        }
      } catch (error) {
        logger.error('[FBX] Error updating animation mixer:', error);
      }
    }
  });
  
  return (
    // Rotation is handled by the parent group in SceneView, so we don't apply it here
    // This ensures TransformControls rotates around the correct pivot point
    <group ref={groupRef} position={position} rotation={[0, 0, 0]} scale={scale} onClick={onClick}>
      <VisualFallbackMotion
        ref={visualRef}
        enabled={!hasMatchingClip && Boolean(playAnimation)}
        animationState={animationState}
        reducedMotion={reducedMotion}
      />
    </group>
  );
}

// Helper function to find animation name based on state
function findAnimationName(state: string, availableAnimations: string[]): string | null {
  const stateLower = state.toLowerCase();
  
  logger.debug(`[findAnimationName] Looking for "${state}" in animations:`, availableAnimations);
  
  // Try exact match first
  const exactMatch = availableAnimations.find((name) => 
    name.toLowerCase() === stateLower
  );
  if (exactMatch) {
    logger.debug(`[findAnimationName] Found exact match: "${exactMatch}"`);
    return exactMatch;
  }
  
  // Try partial matches (more flexible)
  const partialMatch = availableAnimations.find((name) => {
    const nameLower = name.toLowerCase();
    // A semantic state may be part of a descriptive clip name ("WalkCycle"),
    // but a short arbitrary clip name must not match by being a substring of
    // the requested state (for example, "id" is not an idle animation).
    if (nameLower.includes(stateLower)) {
      return true;
    }
    // Also check for common variations like "walking" vs "walk"
    if (stateLower === 'walk' && (nameLower.includes('walk') || nameLower.includes('move'))) {
      return true;
    }
    if (stateLower === 'idle' && (nameLower.includes('idle') || nameLower.includes('stand') || nameLower.includes('rest'))) {
      return true;
    }
    return false;
  });
  if (partialMatch) {
    logger.debug(`[findAnimationName] Found partial match: "${partialMatch}"`);
    return partialMatch;
  }
  
  // Try common variations
  const variations: Record<string, string[]> = {
    idle: ['idle', 'Idle', 'IDLE', 'stand', 'Stand', 'STAND'],
    walk: ['walk', 'Walk', 'WALK', 'walking', 'Walking', 'WALKING'],
    run: ['run', 'Run', 'RUN', 'running', 'Running', 'RUNNING'],
    jump: ['jump', 'Jump', 'JUMP', 'jumping', 'Jumping', 'JUMPING'],
    fall: ['fall', 'Fall', 'FALL', 'falling', 'Falling', 'FALLING'],
  };
  
  if (variations[stateLower]) {
    for (const variant of variations[stateLower]) {
      const match = availableAnimations.find((name) => 
        name.toLowerCase().includes(variant.toLowerCase())
      );
      if (match) {
        logger.debug(`[findAnimationName] Found via variation "${variant}": "${match}"`);
        return match;
      }
    }
  }
  
  logger.debug(`[findAnimationName] No match found for "${state}"`);
  return null;
}
