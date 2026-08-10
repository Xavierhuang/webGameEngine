/**
 * Enhanced TypeScript types for the game engine
 */

import * as THREE from 'three';

// Game Object Types
export type GameObjectType = 'character' | 'platform' | 'collectible' | 'obstacle' | 'sprite' | 'sound';
export type ShapeType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'pyramid' | 'torus' | 'capsule' | 'plane' | 'model' | 'circle';
export type AnimationState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'stop' | null;

// Position and Transform
export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Rotation {
  x: number;
  y: number;
  z: number;
}

export interface Scale {
  width?: number;
  height?: number;
  depth?: number;
  // For uniform scaling
  value?: number;
}

// Game Object Properties
export interface GameObjectProperties {
  shape?: ShapeType;
  color?: string;
  size?: number | Scale;
  model_url?: string;
  animationState?: AnimationState;
  has_physics?: boolean;
  sprite_data?: {
    model_url?: string;
    color?: string;
    shape?: ShapeType;
  };
  [key: string]: any; // Allow additional properties
}

// Logic Block Types
export type LogicBlockType = 
  | 'on_key_press'
  | 'move'
  | 'jump'
  | 'rotate'
  | 'scale'
  | 'play_sound'
  | 'if_then'
  | 'repeat'
  | 'wait'
  | 'set_variable';

export type LogicBlockCategory = 'event' | 'action' | 'condition' | 'movement' | 'input' | 'sound' | 'variable';

export interface LogicBlock {
  id: string;
  block_type: LogicBlockType;
  category?: LogicBlockCategory;
  block_data?: string | Record<string, any>;
  position?: { x: number; y: number };
  connections?: {
    next?: string;
    condition?: string;
    then?: string;
    else?: string;
  };
}

// Game Object
export interface GameObject {
  id: string;
  name: string;
  type: GameObjectType;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  rotation_x?: number;
  rotation_y?: number;
  rotation_z?: number;
  properties?: string | GameObjectProperties;
  logic_blocks?: LogicBlock[];
  has_physics?: boolean;
  scene_id?: string;
  created_at?: string;
  updated_at?: string;
}

// Scene
export interface Scene {
  id: string;
  name: string;
  project_id: string;
  background_color?: string;
  game_objects?: GameObject[];
  created_at?: string;
  updated_at?: string;
}

// Project
export interface Project {
  id: string;
  title: string;
  description?: string;
  owner_id: string;
  scenes?: Scene[];
  created_at?: string;
  updated_at?: string;
}

// Physics
export interface PhysicsState {
  velocity: THREE.Vector3;
  isGrounded: boolean;
  position: THREE.Vector3;
}

// Animation
export interface AnimationConfig {
  state: AnimationState;
  loop?: boolean;
  speed?: number;
  onComplete?: () => void;
  onLoop?: () => void;
}

// Input
export interface KeyState {
  [key: string]: boolean;
}

// Camera
export interface CameraConfig {
  position: [number, number, number];
  fov: number;
  near: number;
  far: number;
  followTarget?: THREE.Vector3 | null;
  followOffset?: [number, number, number];
  followLerpSpeed?: number;
}

// Rendering
export interface RenderConfig {
  backgroundColor: string;
  gridSize: number;
  gridCellSize: number;
  enableShadows?: boolean;
  enableFog?: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateGameObjectRequest {
  name: string;
  type: GameObjectType;
  scene_id: string;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  properties?: GameObjectProperties;
}

export interface UpdateGameObjectRequest {
  name?: string;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  rotation_x?: number;
  rotation_y?: number;
  rotation_z?: number;
  properties?: GameObjectProperties;
}

// Asset Types
export interface Asset {
  id: string;
  name: string;
  url: string;
  type: 'model' | 'texture' | 'audio' | 'image';
  format?: string;
  size?: number;
  created_at?: string;
}

// Model Cache
export interface CachedModel {
  url: string;
  model: THREE.Object3D | THREE.Group;
  animations?: THREE.AnimationClip[];
  loadedAt: number;
  size: number;
}
