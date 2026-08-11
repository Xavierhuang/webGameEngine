'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { modelCache } from '../../lib/utils/modelCache';
import { logger } from '../../lib/utils/logger';
import { ErrorBoundary } from '../common/ErrorBoundary';

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
}: AnimatedModelProps) {
  const { scene, animations } = useGLTF(url);
  const { actions, mixer } = useAnimations(animations, scene);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    onLoad?.();
  }, [onLoad, scene]);
  
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
    const animationName = findAnimationName(animationState, Object.keys(actions));
    if (animationName && actions[animationName]) {
      const action = actions[animationName];
      action.reset().fadeIn(0.2).setLoop(THREE.LoopRepeat, Infinity).play();
      logger.debug(`[GLTF/GLB] Playing animation: "${animationName}" (looping)`);
    } else if (Object.keys(actions).length > 0) {
      // Fallback to first available animation
      const firstAction = Object.values(actions)[0];
      if (firstAction) {
        firstAction.reset().fadeIn(0.2).setLoop(THREE.LoopRepeat, Infinity).play();
        logger.debug(`[GLTF/GLB] Playing first available animation (looping)`);
      }
    }
    
    return () => {
      Object.values(actions).forEach((action) => {
        if (action) action.fadeOut(0.2);
      });
    };
  }, [actions, animationState, playAnimation]);
  
  useFrame((state, delta) => {
    if (mixer) {
      mixer.update(delta);
    }
  });
  
  // Rotation is handled by the parent group in SceneView, so we don't apply it here
  // This ensures TransformControls rotates around the correct pivot point
  return (
    <group ref={groupRef} position={position} rotation={[0, 0, 0]} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}

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
}: AnimatedModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const animationsRef = useRef<THREE.AnimationClip[]>([]);
  
  const fbxLoadedRef = useRef(false);
  
  useEffect(() => {
    // Only load once per URL
    if (fbxLoadedRef.current) return;
    
    const loadFBX = async () => {
      try {
        // Check cache first
        const cached = await modelCache.get(url);
        let fbx: THREE.Group;
        let animations: THREE.AnimationClip[] = [];
        
        if (cached) {
          logger.debug('[FBXAnimatedModel] Using cached model:', url);
          // Clone the cached model to avoid shared mutations
          fbx = cached.model.clone() as THREE.Group;
          animations = cached.animations ? [...cached.animations] : [];
        } else {
          logger.debug('[FBXAnimatedModel] Loading FBX from URL:', url);
          const { FBXLoader } = require('three/examples/jsm/loaders/FBXLoader.js');
          const loader = new FBXLoader();
          fbx = await new Promise<THREE.Group>((resolve, reject) => {
            loader.load(
              url,
              (object: THREE.Group) => resolve(object),
              undefined,
              (error: any) => reject(error)
            );
          });
          
          // Extract animations before caching
          if (fbx.animations && fbx.animations.length > 0) {
            animations = fbx.animations;
          }
          
          // Cache the model
          modelCache.set(url, fbx, animations);
          logger.debug('[FBXAnimatedModel] Cached FBX model:', url);
        }
        
        if (groupRef.current) {
          // Clear previous model
          while (groupRef.current.children.length > 0) {
            groupRef.current.remove(groupRef.current.children[0]);
          }
          groupRef.current.add(fbx);
          onLoad?.();
          
          // Extract animations
          if (animations.length > 0) {
            animationsRef.current = animations;
            const animationNames = animations.map((clip: THREE.AnimationClip) => clip.name);
            logger.info(`[FBX Model] Found ${animationNames.length} animation(s):`, animationNames);
            if (onAnimationsLoaded) {
              onAnimationsLoaded(animationNames);
            }
            
            // Create animation mixer - attach to the root FBX object
            // The mixer needs to be attached to the object that has the skeleton/bones
            mixerRef.current = new THREE.AnimationMixer(fbx);
            logger.debug('[FBX Model] Animation mixer created for FBX root');
            
            fbxLoadedRef.current = true;
          } else {
            logger.warn('[FBX Model] No animations found in this model. Model structure:', {
              hasAnimations: !!fbx.animations,
              animationsLength: fbx.animations?.length || 0,
              children: fbx.children?.length || 0
            });
          }
        }
      } catch (error) {
        logger.error('Failed to load FBX:', error);
        onError?.(error);
      }
    };
    
    loadFBX();
    
    // Cleanup: release cache reference when component unmounts
    return () => {
      modelCache.release(url);
    };
  }, [url, onAnimationsLoaded, onLoad, onError]);
  
  const lastAnimationStateRef = useRef<string | null>(null);
  
  useEffect(() => {
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
    
    // Find matching animation
    const animationNames = animationsRef.current.map((clip) => clip.name);
    const animationName = findAnimationName(animationState, animationNames);
    logger.debug(`[FBX] Matched animation name: "${animationName}"`);
    
    // If no match found but we want "walk" and there's only one animation, use it
    let clip = animationsRef.current.find((clip) => clip.name === animationName);
    if (!clip && animationState === 'walk' && animationsRef.current.length === 1) {
      clip = animationsRef.current[0];
      logger.debug(`[FBX] Using single available animation "${clip.name}" for walk state`);
    }
    // Fallback to first animation
    if (!clip) {
      clip = animationsRef.current[0];
      logger.debug(`[FBX] Using first available animation "${clip.name}" as fallback`);
    }
    
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
  }, [animationState, playAnimation]);
  
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
    <group ref={groupRef} position={position} rotation={[0, 0, 0]} scale={scale} />
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
    // Check if state is contained in name or vice versa
    if (nameLower.includes(stateLower) || stateLower.includes(nameLower)) {
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
  
  // If no match found and we're looking for "walk" and there's only one animation,
  // assume it's the walking animation (common case for single-animation FBX files)
  if (stateLower === 'walk' && availableAnimations.length === 1) {
    logger.debug(`[findAnimationName] Using single available animation as walk: "${availableAnimations[0]}"`);
    return availableAnimations[0];
  }
  
  logger.debug(`[findAnimationName] No match found for "${state}"`);
  return null;
}
