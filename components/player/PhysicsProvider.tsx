'use client';

import { useEffect, useRef, useMemo, createContext, useContext } from 'react';
import { useFrame } from '@react-three/fiber';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { logger } from '../../lib/utils/logger';
import { PHYSICS } from '../../lib/constants/game';

interface PhysicsProviderProps {
  children: React.ReactNode;
}

export function PhysicsProvider({ children }: PhysicsProviderProps) {
  const worldRef = useRef<CANNON.World | null>(null);
  const bodiesRef = useRef<Map<string, CANNON.Body>>(new Map());
  
  // Create physics world
  const world = useMemo(() => {
    const w = new CANNON.World({
      gravity: new CANNON.Vec3(0, -PHYSICS.GRAVITY, 0),
    });
    
    // Set solver iterations for better stability
    w.solver.iterations = 10;
    w.broadphase = new CANNON.NaiveBroadphase();
    
    // Create ground plane
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0 }); // Static body
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.position.set(0, PHYSICS.GROUND_Y, 0);
    w.addBody(groundBody);
    
    logger.debug('[PhysicsProvider] Physics world created with ground plane');
    
    return w;
  }, []);
  
  worldRef.current = world;
  
  // Step physics simulation
  useFrame((state, delta) => {
    if (worldRef.current) {
      // Clamp delta to prevent large jumps
      const clampedDelta = Math.min(delta, 0.1);
      worldRef.current.step(clampedDelta);
    }
  });
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (worldRef.current) {
        // Remove all bodies
        worldRef.current.bodies.forEach((body) => {
          worldRef.current?.removeBody(body);
        });
        logger.debug('[PhysicsProvider] Physics world cleaned up');
      }
    };
  }, []);
  
  return (
    <physicsContext.Provider value={{ world, bodiesRef }}>
      {children}
    </physicsContext.Provider>
  );
}

// Physics context
interface PhysicsContextType {
  world: CANNON.World;
  bodiesRef: React.MutableRefObject<Map<string, CANNON.Body>>;
}

const physicsContext = createContext<PhysicsContextType | null>(null);

export function usePhysics() {
  const context = useContext(physicsContext);
  if (!context) {
    throw new Error('usePhysics must be used within PhysicsProvider');
  }
  return context;
}

// Hook to sync Three.js object with Cannon.js body
export function usePhysicsBody(
  meshRef: React.RefObject<THREE.Object3D>,
  options: {
    mass?: number;
    shape?: 'box' | 'sphere' | 'cylinder' | 'plane';
    size?: [number, number, number] | number;
    position?: [number, number, number];
    objectId?: string;
  }
) {
  const { world, bodiesRef } = usePhysics();
  const bodyRef = useRef<CANNON.Body | null>(null);
  
  useEffect(() => {
    if (!meshRef.current || !options.objectId) return;
    
    const { mass = 1, shape = 'box', size = 1, position = [0, 0, 0] } = options;
    
    // Create shape
    let cannonShape: CANNON.Shape;
    if (shape === 'box') {
      const [w, h, d] = Array.isArray(size) ? size : [size, size, size];
      cannonShape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
    } else if (shape === 'sphere') {
      const radius = Array.isArray(size) ? size[0] : size;
      cannonShape = new CANNON.Sphere(radius);
    } else if (shape === 'cylinder') {
      const radius = Array.isArray(size) ? size[0] : size;
      const height = Array.isArray(size) ? size[1] : size;
      cannonShape = new CANNON.Cylinder(radius, radius, height, 8);
    } else {
      cannonShape = new CANNON.Plane();
    }
    
    // Create body
    const body = new CANNON.Body({ mass });
    body.addShape(cannonShape);
    body.position.set(position[0], position[1], position[2]);
    
    // Add to world
    world.addBody(body);
    bodiesRef.current.set(options.objectId, body);
    bodyRef.current = body;
    
    logger.debug(`[usePhysicsBody] Created physics body for ${options.objectId}`, {
      mass,
      shape,
      size,
      position,
    });
    
    // Sync Three.js position to Cannon.js
    if (meshRef.current) {
      const pos = meshRef.current.position;
      body.position.set(pos.x, pos.y, pos.z);
    }
    
    return () => {
      if (bodyRef.current) {
        world.removeBody(bodyRef.current);
        bodiesRef.current.delete(options.objectId!);
        logger.debug(`[usePhysicsBody] Removed physics body for ${options.objectId}`);
      }
    };
  }, [meshRef, world, bodiesRef, options.objectId, options.mass, options.shape, JSON.stringify(options.size), JSON.stringify(options.position)]);
  
  // Sync physics body to Three.js mesh
  useFrame(() => {
    if (bodyRef.current && meshRef.current) {
      const pos = bodyRef.current.position;
      const quat = bodyRef.current.quaternion;
      
      meshRef.current.position.set(pos.x, pos.y, pos.z);
      meshRef.current.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    }
  });
  
  return bodyRef.current;
}

