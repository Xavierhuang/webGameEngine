/**
 * Game engine constants
 * Centralized configuration values
 */

// Physics constants
export const PHYSICS = {
  GRAVITY: 9.8,
  GROUND_Y: -2,
  GROUND_TOLERANCE: 0.01,
  FRICTION: 0.9,
  JUMP_FORCE: 8,
  MOVE_SPEED: 5,
  TERMINAL_VELOCITY: 50,
} as const;

// Camera constants
export const CAMERA = {
  DEFAULT_POSITION: [0, 8, 15] as [number, number, number],
  DEFAULT_FOV: 50,
  DEFAULT_NEAR: 0.1,
  DEFAULT_FAR: 2000,
  FOLLOW_OFFSET: [0, 5, 10] as [number, number, number],
  FOLLOW_LERP_SPEED: 2,
} as const;

// Scene constants
export const SCENE = {
  DEFAULT_BACKGROUND_COLOR: '#87CEEB', // Sky blue
  GRID_SIZE: 20,
  GRID_CELL_SIZE: 1,
  GRID_CELL_COLOR: '#6B7280',
  GRID_SECTION_COLOR: '#4B5563',
  GRID_POSITION: [0, -2, 0] as [number, number, number],
} as const;

// Lighting constants
export const LIGHTING = {
  AMBIENT_INTENSITY: 1.2,
  POINT_LIGHT_POSITION: [10, 10, 10] as [number, number, number],
  POINT_LIGHT_INTENSITY: 2.0,
  DIRECTIONAL_LIGHT_1_POSITION: [-10, 10, -5] as [number, number, number],
  DIRECTIONAL_LIGHT_1_INTENSITY: 1.0,
  DIRECTIONAL_LIGHT_2_POSITION: [10, 5, 5] as [number, number, number],
  DIRECTIONAL_LIGHT_2_INTENSITY: 0.8,
  HEMISPHERE_LIGHT_INTENSITY: 0.5,
} as const;

// Animation constants
export const ANIMATION = {
  STATES: {
    IDLE: 'idle',
    WALK: 'walk',
    RUN: 'run',
    JUMP: 'jump',
    FALL: 'fall',
    STOP: 'stop',
  } as const,
  TRANSITION_DURATION: 0.3,
  DEFAULT_LOOP: true,
} as const;

// Movement detection thresholds
export const MOVEMENT = {
  MIN_MOVE_THRESHOLD: 0.001,
  MIN_VELOCITY_THRESHOLD: 0.01,
  JUMP_VELOCITY_THRESHOLD: 0.5,
  FALL_VELOCITY_THRESHOLD: -0.5,
} as const;

// Rendering constants
export const RENDERING = {
  SKY_DOME_SCALE: 1000,
  SKY_DOME_SEGMENTS: 32,
  DEFAULT_PLATFORM_ROTATION: -Math.PI / 2, // -90 degrees to lay flat
} as const;

// Object defaults
export const OBJECT_DEFAULTS = {
  CHARACTER: {
    SHAPE: 'box',
    COLOR: '#60A5FA',
    SIZE: 50,
  },
  PLATFORM: {
    SHAPE: 'plane',
    COLOR: '#166534',
    SIZE: { width: 2000, height: 2000 },
  },
  COLLECTIBLE: {
    SHAPE: 'sphere',
    COLOR: '#FBBF24',
    SIZE: 30,
  },
  OBSTACLE: {
    SHAPE: 'box',
    COLOR: '#EF4444',
    SIZE: 50,
  },
} as const;

// Key mappings
export const KEYS = {
  MOVE_LEFT: ['arrowleft', 'a'],
  MOVE_RIGHT: ['arrowright', 'd'],
  MOVE_FORWARD: ['arrowup', 'w'],
  MOVE_BACKWARD: ['arrowdown', 's'],
  JUMP: [' '],
} as const;








