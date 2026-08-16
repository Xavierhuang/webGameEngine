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

// Costume: an alternate appearance for a game object (Scratch costume analog).
export interface Costume {
  name: string;
  color?: string;
  shape?: ShapeType;
  model_url?: string;
  model_bounds?: { min: Position; max: Position };
  model_origin_offset?: Position;
}

// Game Object Properties
export interface GameObjectProperties {
  costumes?: Costume[];
  /** 0-based index into costumes; blocks/reporters use 1-based like Scratch. */
  current_costume?: number;
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
  | 'on_start'
  | 'on_key_press'
  | 'when_clicked'
  | 'when_touches'
  | 'when_receive'
  | 'move'
  | 'jump'
  | 'rotate'
  | 'scale'
  | 'play_sound'
  | 'play_sound_until_done'
  | 'stop_all_sounds'
  | 'set_volume'
  | 'change_volume_by'
  | 'if_then'
  | 'repeat'
  | 'repeat_until'
  | 'forever'
  | 'wait'
  | 'wait_until'
  | 'stop'
  | 'broadcast'
  | 'broadcast_and_wait'
  | 'create_clone_of'
  | 'delete_clone'
  | 'when_clone_start'
  | 'when_scene_starts'
  | 'switch_to_scene'
  | 'next_scene'
  | 'define_custom_block'
  | 'call_custom_block'
  | 'add_to_list'
  | 'delete_from_list'
  | 'delete_all_of_list'
  | 'insert_into_list'
  | 'replace_in_list'
  | 'show_list'
  | 'hide_list'
  | 'set_variable'
  | 'change_variable'
  | 'show_variable'
  | 'hide_variable'
  // Phase 5a: motion writers
  | 'goto_xyz'
  | 'goto_object'
  | 'change_xyz'
  | 'set_x'
  | 'set_y'
  | 'set_z'
  | 'glide_to_xyz'
  | 'point_towards'
  | 'set_rotation'
  // Phase 5b: looks basics
  | 'show'
  | 'hide'
  | 'set_size'
  | 'change_size_by'
  | 'say'
  | 'think'
  | 'clear_bubble'
  | 'set_color'
  | 'switch_costume_to'
  | 'next_costume'
  | 'switch_animation_to'
  // Music extension
  | 'play_note'
  | 'play_drum'
  | 'rest_for_beats'
  | 'set_instrument'
  | 'set_tempo'
  | 'change_tempo_by'
  // Text-to-speech
  | 'speak'
  | 'speak_until_done'
  // Translate extension
  | 'translate_to'
  // Pen extension
  | 'pen_down'
  | 'pen_up'
  | 'pen_clear'
  | 'pen_set_color'
  | 'pen_set_size'
  // Graphic effects + layer ordering
  | 'set_effect'
  | 'change_effect_by'
  | 'clear_effects'
  | 'go_to_layer'
  | 'change_layer_by'
  // Sensing statements
  | 'ask_and_wait'
  | 'reset_timer'
  | 'you_win'
  | 'game_over'
  | 'show_message'
  | 'clear_message'
  | 'camera_follow'
  | 'camera_stop_following'
  | 'camera_shake'
  | 'camera_zoom'
  | 'camera_zoom_by'
  | 'burst_particles'
  | 'start_particles'
  | 'stop_particles'
  | 'set_particle_size'
  | 'set_particle_amount'
  | 'when_video_motion'
  | 'set_video'
  | 'set_video_transparency'
  // Phase 5c: AI blocks
  | 'ask_ai'
  | 'ai_decide';

export type LogicBlockCategory = 'event' | 'action' | 'condition' | 'movement' | 'input' | 'sound' | 'variable';

// Expression tree used in block inputs. Leaf literals use { op: 'literal', value };
// variable references use { op: 'var', value: '<name>' }; everything else is an
// operator whose operands live in args.
export type ExprValue = number | string | boolean;

export interface Expr {
  op: string;
  args?: Expr[];
  value?: ExprValue;
}

export type VariableScope = 'global' | 'object';

export interface LogicBlock {
  id: string;
  block_type: LogicBlockType;
  category?: LogicBlockCategory;
  block_data?: string | Record<string, any>;
  // New interpreter model: parameterized inputs + nested bodies.
  // Legacy AI-generated blocks carry parameters in block_data instead; the
  // interpreter accepts both.
  inputs?: Record<string, Expr | ExprValue>;
  children?: LogicBlock[];
  elseChildren?: LogicBlock[];
  position?: { x: number; y: number };
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
  scale_x?: number;
  scale_y?: number;
  color?: string | null;
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
