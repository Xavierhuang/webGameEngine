/**
 * Source-backed starter worlds. Keep this module as plain data so it can be
 * compiled and checked in Node without loading React, the database, or the
 * runtime.
 */

export type WorldTemplateObjectType = 'character' | 'platform' | 'collectible' | 'obstacle' | 'sprite' | 'sound';

export interface WorldTemplateBlock {
  id: string;
  block_type: string;
  inputs?: Record<string, unknown>;
  children?: WorldTemplateBlock[];
  elseChildren?: WorldTemplateBlock[];
}

export interface WorldTemplateObject {
  id: string;
  name: string;
  type: WorldTemplateObjectType;
  position: [number, number, number];
  playerControlled?: boolean;
  modelUrl?: string;
  shape?: 'box' | 'sphere' | 'cylinder' | 'cone' | 'pyramid' | 'torus' | 'capsule' | 'plane' | 'model' | 'circle';
  color?: string;
  /** Extra persisted settings, such as an autoplaying background beat. */
  properties?: Record<string, unknown>;
  blocks: WorldTemplateBlock[];
}

export interface WorldTemplateScene {
  id: string;
  name: string;
  backgroundColor: string;
  backgroundImageUrl: string;
  objects: WorldTemplateObject[];
}

export type WorldMissionKind = 'object_present' | 'block_present' | 'play_started' | 'outcome_reached';

export interface WorldMission {
  id: string;
  title: string;
  description: string;
  kind: WorldMissionKind;
  /** Required type for a newly-created object, verified against the baseline. */
  objectType?: WorldTemplateObjectType;
  objectId?: string;
  blockType?: string;
  outcome?: 'win' | 'fun';
}

export interface WorldTemplateBudget {
  maxScenes: number;
  maxObjects: number;
  maxBlocks: number;
  maxClones: number;
  maxAssetBytes: number;
  maxScriptStepsPerFrame: number;
}

export interface WorldTemplate {
  id: string;
  version: number;
  /** Only the latest approved version is offered by the normal catalog picker. */
  active: boolean;
  title: string;
  description: string;
  genre: string;
  cardArt: string;
  budgets: WorldTemplateBudget;
  scenes: WorldTemplateScene[];
  missions: WorldMission[];
}

const CONSERVATIVE_BUDGETS: WorldTemplateBudget = {
  maxScenes: 3,
  maxObjects: 30,
  maxBlocks: 160,
  maxClones: 20,
  maxAssetBytes: 16 * 1024 * 1024,
  maxScriptStepsPerFrame: 120,
};

function playerBlocks(id: string, name: string, movementDistance = 120): WorldTemplateBlock[] {
  return [
    { id: `${id}-start`, block_type: 'on_start' },
    { id: `${id}-follow`, block_type: 'camera_follow', inputs: { target: name } },
    { id: `${id}-up`, block_type: 'on_key_press', inputs: { key: 'ArrowUp' } },
    { id: `${id}-move-up`, block_type: 'move', inputs: { direction: 'up', distance: movementDistance } },
    { id: `${id}-down`, block_type: 'on_key_press', inputs: { key: 'ArrowDown' } },
    { id: `${id}-move-down`, block_type: 'move', inputs: { direction: 'down', distance: movementDistance } },
    { id: `${id}-left`, block_type: 'on_key_press', inputs: { key: 'ArrowLeft' } },
    { id: `${id}-move-left`, block_type: 'move', inputs: { direction: 'left', distance: movementDistance } },
    { id: `${id}-right`, block_type: 'on_key_press', inputs: { key: 'ArrowRight' } },
    { id: `${id}-move-right`, block_type: 'move', inputs: { direction: 'right', distance: movementDistance } },
  ];
}

/**
 * Converts a server-owned template object into the settings format consumed by
 * both a saved world and the no-save template preview.
 */
export function materializeTemplateObjectProperties(object: WorldTemplateObject): Record<string, unknown> {
  return {
    shape: object.shape ?? 'box',
    model_url: object.modelUrl,
    playerControlled: object.playerControlled === true,
    ...(object.properties ?? {}),
  };
}

const WORLD_TEMPLATE_SOURCE: WorldTemplate[] = [
  {
    id: 'platformer',
    version: 1,
    active: false,
    title: 'Sky Steps',
    description: 'Leap from platform to platform and grab the bright star.',
    genre: 'Platformer',
    cardArt: '/backdrops/blue-sky.svg',
    budgets: { ...CONSERVATIVE_BUDGETS },
    scenes: [{
      id: 'platformer-sky-steps',
      name: 'Sky Steps',
      backgroundColor: '#8ed7ff',
      backgroundImageUrl: '/backdrops/blue-sky.svg',
      objects: [
        { id: 'platformer-hero', name: 'Hero', type: 'character', playerControlled: true, position: [0, 0, 0], modelUrl: '/models/starters/hero.glb', shape: 'model', blocks: playerBlocks('platformer-hero', 'Hero') },
        { id: 'platformer-ground', name: 'Starting Platform', type: 'platform', position: [0, -1, 0], shape: 'box', color: '#4f8f44', blocks: [] },
        { id: 'platformer-star', name: 'Goal Star', type: 'collectible', position: [5, 1, 0], modelUrl: '/models/starters/star.glb', shape: 'model', blocks: [
          { id: 'platformer-star-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
          { id: 'platformer-star-win', block_type: 'you_win', inputs: { message: 'You reached the sky star!' } },
        ] },
      ],
    }],
    missions: [
      { id: 'platformer-name-hero', title: 'Make it yours', description: 'Give your hero a name you like.', kind: 'object_present', objectId: 'platformer-hero' },
      { id: 'platformer-add-jump', title: 'Try a jump', description: 'Add a jump block to help your hero climb.', kind: 'block_present', blockType: 'jump' },
      { id: 'platformer-play', title: 'Play your world', description: 'Press Play and try reaching the star.', kind: 'play_started' },
    ],
  },
  {
    id: 'platformer',
    version: 2,
    active: true,
    title: 'Sky Steps',
    description: 'Climb friendly sky steps, collect bright stars, and reach the portal.',
    genre: 'Platformer',
    cardArt: '/backdrops/blue-sky.svg',
    budgets: { ...CONSERVATIVE_BUDGETS },
    scenes: [{
      id: 'sky-steps',
      name: 'Sky Steps',
      backgroundColor: '#8ed7ff',
      backgroundImageUrl: '/backdrops/blue-sky.svg',
      objects: [
        {
          id: 'sky-hero',
          name: 'Hero',
          type: 'character',
          playerControlled: true,
          position: [0, -2, 0],
          modelUrl: '/models/starters/hero.glb',
          shape: 'model',
          blocks: [
            ...playerBlocks('sky-hero', 'Hero', 500),
            { id: 'sky-hero-space', block_type: 'on_key_press', inputs: { key: 'SPACE' } },
            { id: 'sky-hero-jump', block_type: 'jump' },
            { id: 'sky-hero-jump-sound', block_type: 'play_sound', inputs: { sound: 'jump' } },
          ],
        },
        {
          id: 'sky-music',
          name: 'Sky Music',
          type: 'sound',
          position: [0, -2, 0],
          properties: { autoplay_beat: true, beat: 'chill', bpm: 90 },
          blocks: [],
        },
        { id: 'sky-start-island', name: 'Starting Island', type: 'platform', position: [0, -2, 0], shape: 'box', color: '#4f8f44', blocks: [] },
        { id: 'sky-step-one', name: 'Sky Step One', type: 'platform', position: [12, -1, 0], shape: 'box', color: '#74b65d', blocks: [] },
        { id: 'sky-step-two', name: 'Sky Step Two', type: 'platform', position: [24, 0, 0], shape: 'box', color: '#74b65d', blocks: [] },
        { id: 'sky-extra-platform', name: 'Sky Step Three', type: 'platform', position: [36, 1, 0], shape: 'box', color: '#74b65d', blocks: [] },
        {
          id: 'sky-star-one',
          name: 'Sky Star One',
          type: 'collectible',
          position: [12, -0.75, 0],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'sky-star-one-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
            { id: 'sky-star-one-say', block_type: 'say', inputs: { text: 'Star collected!' } },
            { id: 'sky-star-one-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'sky-star-one-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'sky-star-two',
          name: 'Sky Star Two',
          type: 'collectible',
          position: [24, 0.25, 0],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'sky-star-two-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
            { id: 'sky-star-two-say', block_type: 'say', inputs: { text: 'Star collected!' } },
            { id: 'sky-star-two-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'sky-star-two-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'sky-extra-star',
          name: 'Sky Star Three',
          type: 'collectible',
          position: [36, 1.25, 0],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'sky-star-three-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
            { id: 'sky-star-three-say', block_type: 'say', inputs: { text: 'Star collected!' } },
            { id: 'sky-star-three-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'sky-star-three-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'sky-moving-cloud',
          name: 'Moving Cloud',
          type: 'obstacle',
          position: [28, 2, 1],
          shape: 'sphere',
          color: '#ffffff',
          blocks: [{
            id: 'sky-cloud-loop',
            block_type: 'forever',
            children: [{ id: 'sky-cloud-slide', block_type: 'move', inputs: { direction: 'left', distance: 1 } }],
          }],
        },
        {
          id: 'sky-portal',
          name: 'Sky Portal',
          type: 'sprite',
          position: [36, 1.25, 0],
          shape: 'torus',
          color: '#fbbf24',
          blocks: [
            { id: 'sky-portal-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
            { id: 'sky-portal-fanfare', block_type: 'play_sound', inputs: { sound: 'fanfare' } },
            { id: 'sky-portal-win', block_type: 'you_win', inputs: { message: 'You climbed every Sky Step!' } },
          ],
        },
      ],
    }],
    missions: [
      { id: 'sky-steps-add-platform', title: 'Build a new step', description: 'Add a new platform after the starting steps.', kind: 'object_present', objectType: 'platform' },
      { id: 'sky-steps-add-star', title: 'Add a sky star', description: 'Add a new collectible after the starting stars.', kind: 'object_present', objectType: 'collectible' },
      { id: 'sky-steps-play', title: 'Play Sky Steps', description: 'Press Play and try the new steps.', kind: 'play_started' },
    ],
  },
  {
    id: 'obby',
    version: 1,
    active: true,
    title: 'Rainbow Obby',
    description: 'Dash along a colorful obstacle path and touch the finish star.',
    genre: 'Obstacle course',
    cardArt: '/backdrops/rainbow.svg',
    budgets: { ...CONSERVATIVE_BUDGETS },
    scenes: [{
      id: 'obby-rainbow-run',
      name: 'Rainbow Run',
      backgroundColor: '#f7ddff',
      backgroundImageUrl: '/backdrops/rainbow.svg',
      objects: [
        {
          id: 'obby-runner',
          name: 'Runner',
          type: 'character',
          playerControlled: true,
          position: [0, 0, 0],
          modelUrl: '/models/starters/ninja.glb',
          shape: 'model',
          blocks: [
            ...playerBlocks('obby-runner', 'Runner', 500),
            { id: 'obby-runner-space', block_type: 'on_key_press', inputs: { key: 'SPACE' } },
            { id: 'obby-runner-jump', block_type: 'jump' },
            { id: 'obby-runner-jump-sound', block_type: 'play_sound', inputs: { sound: 'jump' } },
          ],
        },
        { id: 'obby-music', name: 'Rainbow Beat', type: 'sound', position: [0, -1, 0], properties: { autoplay_beat: true, beat: 'simple', bpm: 128 }, blocks: [] },
        { id: 'obby-ground', name: 'Pink Start Pad', type: 'platform', position: [0, -1, 0], shape: 'box', color: '#f472b6', properties: { size: { width: 1200, height: 650 } }, blocks: [] },
        { id: 'obby-orange-pad', name: 'Orange Bounce Pad', type: 'platform', position: [10, -1, 0], shape: 'box', color: '#fb923c', properties: { size: { width: 1200, height: 650 } }, blocks: [] },
        { id: 'obby-yellow-pad', name: 'Sunny Safe Pad', type: 'platform', position: [20, -1, 0], shape: 'box', color: '#facc15', properties: { size: { width: 1200, height: 650 } }, blocks: [] },
        { id: 'obby-blue-pad', name: 'Blue Finish Pad', type: 'platform', position: [30, -1, 0], shape: 'box', color: '#60a5fa', properties: { size: { width: 1200, height: 650 } }, blocks: [] },
        {
          id: 'obby-bumper',
          name: 'Spinning Bumper One',
          type: 'obstacle',
          position: [7, -0.75, 0],
          shape: 'sphere',
          color: '#fbbf24',
          blocks: [
            { id: 'obby-bumper-spin', block_type: 'forever', children: [{ id: 'obby-bumper-turn', block_type: 'rotate', inputs: { x: 0, y: 5, z: 0 } }] },
            { id: 'obby-bumper-touch', block_type: 'when_touches', inputs: { target: 'Runner' } },
            { id: 'obby-bumper-hit', block_type: 'play_sound', inputs: { sound: 'hit' } },
            { id: 'obby-bumper-game-over', block_type: 'game_over', inputs: { message: 'Bonk! Try a different path around the bumper.' } },
          ],
        },
        {
          id: 'obby-bumper-two',
          name: 'Spinning Bumper Two',
          type: 'obstacle',
          position: [24, -0.75, 1],
          shape: 'sphere',
          color: '#a855f7',
          blocks: [
            { id: 'obby-bumper-two-spin', block_type: 'forever', children: [{ id: 'obby-bumper-two-turn', block_type: 'rotate', inputs: { x: 0, y: -5, z: 0 } }] },
            { id: 'obby-bumper-two-touch', block_type: 'when_touches', inputs: { target: 'Runner' } },
            { id: 'obby-bumper-two-hit', block_type: 'play_sound', inputs: { sound: 'hit' } },
            { id: 'obby-bumper-two-game-over', block_type: 'game_over', inputs: { message: 'Almost! Steer around that last bumper.' } },
          ],
        },
        {
          id: 'obby-rainbow-gem-one',
          name: 'Rainbow Gem One',
          type: 'collectible',
          position: [10, -0.75, -2],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'obby-rainbow-gem-one-touch', block_type: 'when_touches', inputs: { target: 'Runner' } },
            { id: 'obby-rainbow-gem-one-say', block_type: 'say', inputs: { text: 'Rainbow gem collected!' } },
            { id: 'obby-rainbow-gem-one-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'obby-rainbow-gem-one-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'obby-rainbow-gem-two',
          name: 'Rainbow Gem Two',
          type: 'collectible',
          position: [20, -0.75, -2],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'obby-rainbow-gem-two-touch', block_type: 'when_touches', inputs: { target: 'Runner' } },
            { id: 'obby-rainbow-gem-two-say', block_type: 'say', inputs: { text: 'One more stretch!' } },
            { id: 'obby-rainbow-gem-two-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'obby-rainbow-gem-two-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'obby-finish',
          name: 'Rainbow Finish Star',
          type: 'collectible',
          position: [34, -0.75, -2],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'obby-finish-touch', block_type: 'when_touches', inputs: { target: 'Runner' } },
            { id: 'obby-finish-fanfare', block_type: 'play_sound', inputs: { sound: 'fanfare' } },
            { id: 'obby-finish-win', block_type: 'you_win', inputs: { message: 'You raced through the Rainbow Obby!' } },
          ],
        },
      ],
    }],
    missions: [
      { id: 'obby-place-platform', title: 'Add a rainbow pad', description: 'Add a safe colorful platform to your obstacle path.', kind: 'object_present', objectId: 'obby-ground' },
      { id: 'obby-make-move', title: 'Make Runner move', description: 'Try changing a move block to race in a new direction.', kind: 'block_present', blockType: 'move' },
      { id: 'obby-play', title: 'Race the course', description: 'Press Play, collect gems, and steer around the bumpers.', kind: 'play_started' },
    ],
  },
  {
    id: 'racing',
    version: 1,
    active: true,
    title: 'Turbo Track',
    description: 'Drive a speedy car around the track and cross the finish line.',
    genre: 'Racing',
    cardArt: '/backdrops/city.svg',
    budgets: { ...CONSERVATIVE_BUDGETS },
    scenes: [{
      id: 'racing-turbo-track',
      name: 'Turbo Track',
      backgroundColor: '#c9e4ff',
      backgroundImageUrl: '/backdrops/city.svg',
      objects: [
        {
          id: 'racing-car',
          name: 'Speedy Car',
          type: 'character',
          playerControlled: true,
          position: [0, 0, 0],
          modelUrl: '/models/starters/car.glb',
          shape: 'model',
          blocks: [
            ...playerBlocks('racing-car', 'Speedy Car', 500),
            { id: 'racing-car-space', block_type: 'on_key_press', inputs: { key: 'SPACE' } },
            { id: 'racing-car-jump', block_type: 'jump' },
            { id: 'racing-car-jump-sound', block_type: 'play_sound', inputs: { sound: 'jump' } },
          ],
        },
        { id: 'racing-music', name: 'Turbo Beat', type: 'sound', position: [0, -1, 0], properties: { autoplay_beat: true, beat: 'simple', bpm: 132 }, blocks: [] },
        { id: 'racing-road', name: 'Starting Grid', type: 'platform', position: [0, -1, 0], shape: 'box', color: '#334155', properties: { size: { width: 1200, height: 700 } }, blocks: [] },
        { id: 'racing-straight-one', name: 'Turbo Straight', type: 'platform', position: [10, -1, 0], shape: 'box', color: '#475569', properties: { size: { width: 1200, height: 700 } }, blocks: [] },
        { id: 'racing-straight-two', name: 'Neon Straight', type: 'platform', position: [20, -1, 0], shape: 'box', color: '#334155', properties: { size: { width: 1200, height: 700 } }, blocks: [] },
        { id: 'racing-finish-road', name: 'Finish Straight', type: 'platform', position: [30, -1, 0], shape: 'box', color: '#475569', properties: { size: { width: 1200, height: 700 } }, blocks: [] },
        {
          id: 'racing-cone-one',
          name: 'Road Cone One',
          type: 'obstacle',
          position: [9, -0.75, 0],
          shape: 'cone',
          color: '#f97316',
          blocks: [
            { id: 'racing-cone-one-spin', block_type: 'forever', children: [{ id: 'racing-cone-one-turn', block_type: 'rotate', inputs: { x: 0, y: 4, z: 0 } }] },
            { id: 'racing-cone-one-touch', block_type: 'when_touches', inputs: { target: 'Speedy Car' } },
            { id: 'racing-cone-one-hit', block_type: 'play_sound', inputs: { sound: 'hit' } },
            { id: 'racing-cone-one-game-over', block_type: 'game_over', inputs: { message: 'Cone crash! Try steering around it.' } },
          ],
        },
        {
          id: 'racing-cone-two',
          name: 'Road Cone Two',
          type: 'obstacle',
          position: [23, -0.75, 1],
          shape: 'cone',
          color: '#fb7185',
          blocks: [
            { id: 'racing-cone-two-spin', block_type: 'forever', children: [{ id: 'racing-cone-two-turn', block_type: 'rotate', inputs: { x: 0, y: -4, z: 0 } }] },
            { id: 'racing-cone-two-touch', block_type: 'when_touches', inputs: { target: 'Speedy Car' } },
            { id: 'racing-cone-two-hit', block_type: 'play_sound', inputs: { sound: 'hit' } },
            { id: 'racing-cone-two-game-over', block_type: 'game_over', inputs: { message: 'That turn was tight! Give the cone more room.' } },
          ],
        },
        {
          id: 'racing-boost-one',
          name: 'Turbo Star One',
          type: 'collectible',
          position: [14, -0.75, -2],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'racing-boost-one-touch', block_type: 'when_touches', inputs: { target: 'Speedy Car' } },
            { id: 'racing-boost-one-say', block_type: 'say', inputs: { text: 'Turbo star!' } },
            { id: 'racing-boost-one-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'racing-boost-one-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'racing-boost-two',
          name: 'Turbo Star Two',
          type: 'collectible',
          position: [27, -0.75, -2],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'racing-boost-two-touch', block_type: 'when_touches', inputs: { target: 'Speedy Car' } },
            { id: 'racing-boost-two-say', block_type: 'say', inputs: { text: 'Finish line ahead!' } },
            { id: 'racing-boost-two-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'racing-boost-two-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'racing-finish',
          name: 'Finish Flag',
          type: 'collectible',
          position: [35, -0.75, -2],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'racing-finish-touch', block_type: 'when_touches', inputs: { target: 'Speedy Car' } },
            { id: 'racing-finish-fanfare', block_type: 'play_sound', inputs: { sound: 'fanfare' } },
            { id: 'racing-finish-win', block_type: 'you_win', inputs: { message: 'First across the Turbo Track finish line!' } },
          ],
        },
      ],
    }],
    missions: [
      { id: 'racing-add-track', title: 'Extend the track', description: 'Add another platform to make the road longer.', kind: 'object_present', objectId: 'racing-road' },
      { id: 'racing-add-sound', title: 'Add a racing sound', description: 'Try a sound block when Speedy Car reaches a turbo star.', kind: 'block_present', blockType: 'play_sound' },
      { id: 'racing-play', title: 'Test drive', description: 'Press Play, avoid the cones, and steer to the flag.', kind: 'play_started' },
    ],
  },
  {
    id: 'story',
    version: 1,
    active: true,
    title: 'Castle Story',
    description: 'Guide a brave explorer through a castle story and find the treasure.',
    genre: 'Story adventure',
    cardArt: '/backdrops/castle.svg',
    budgets: { ...CONSERVATIVE_BUDGETS },
    scenes: [{
      id: 'story-castle-quest',
      name: 'Castle Quest',
      backgroundColor: '#ded8ff',
      backgroundImageUrl: '/backdrops/castle.svg',
      objects: [
        {
          id: 'story-explorer',
          name: 'Explorer',
          type: 'character',
          playerControlled: true,
          position: [0, 0, 0],
          modelUrl: '/models/starters/princess.glb',
          shape: 'model',
          blocks: [
            ...playerBlocks('story-explorer', 'Explorer', 500),
            { id: 'story-explorer-space', block_type: 'on_key_press', inputs: { key: 'SPACE' } },
            { id: 'story-explorer-jump', block_type: 'jump' },
            { id: 'story-explorer-jump-sound', block_type: 'play_sound', inputs: { sound: 'jump' } },
          ],
        },
        { id: 'story-music', name: 'Castle Melody', type: 'sound', position: [0, -1, 0], properties: { autoplay_beat: true, beat: 'simple', bpm: 96 }, blocks: [] },
        { id: 'story-courtyard', name: 'Castle Courtyard', type: 'platform', position: [0, -1, 0], shape: 'box', color: '#8b7b70', properties: { size: { width: 1200, height: 700 } }, blocks: [] },
        { id: 'story-hall', name: 'Banner Hall', type: 'platform', position: [10, -1, 0], shape: 'box', color: '#a78bfa', properties: { size: { width: 1200, height: 700 } }, blocks: [] },
        { id: 'story-tower-path', name: 'Tower Path', type: 'platform', position: [20, -1, 0], shape: 'box', color: '#818cf8', properties: { size: { width: 1200, height: 700 } }, blocks: [] },
        { id: 'story-treasure-terrace', name: 'Treasure Terrace', type: 'platform', position: [30, -1, 0], shape: 'box', color: '#fbbf24', properties: { size: { width: 1200, height: 700 } }, blocks: [] },
        {
          id: 'story-friend',
          name: 'Friendly Wizard',
          type: 'character',
          position: [7, 0, -2],
          modelUrl: '/models/starters/wizard.glb',
          shape: 'model',
          blocks: [
            { id: 'story-friend-click', block_type: 'when_clicked' },
            { id: 'story-friend-magic', block_type: 'play_sound', inputs: { sound: 'magic' } },
            { id: 'story-friend-say', block_type: 'say', inputs: { text: 'Find the two royal stars, then follow the gold path to the treasure!' } },
          ],
        },
        { id: 'story-castle', name: 'Castle Tower', type: 'sprite', position: [19, 0, 3], modelUrl: '/models/starters/castle.glb', shape: 'model', blocks: [] },
        {
          id: 'story-royal-star-one',
          name: 'Royal Star One',
          type: 'collectible',
          position: [14, -0.75, -2],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'story-royal-star-one-touch', block_type: 'when_touches', inputs: { target: 'Explorer' } },
            { id: 'story-royal-star-one-say', block_type: 'say', inputs: { text: 'A royal star lights the way!' } },
            { id: 'story-royal-star-one-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'story-royal-star-one-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'story-royal-star-two',
          name: 'Royal Star Two',
          type: 'collectible',
          position: [25, -0.75, -2],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'story-royal-star-two-touch', block_type: 'when_touches', inputs: { target: 'Explorer' } },
            { id: 'story-royal-star-two-say', block_type: 'say', inputs: { text: 'The treasure terrace is close!' } },
            { id: 'story-royal-star-two-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'story-royal-star-two-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'story-treasure',
          name: 'Treasure Star',
          type: 'collectible',
          position: [35, -0.75, -2],
          modelUrl: '/models/starters/chest.glb',
          shape: 'model',
          blocks: [
            { id: 'story-treasure-touch', block_type: 'when_touches', inputs: { target: 'Explorer' } },
            { id: 'story-treasure-fanfare', block_type: 'play_sound', inputs: { sound: 'fanfare' } },
            { id: 'story-treasure-win', block_type: 'you_win', inputs: { message: 'You found the castle treasure!' } },
          ],
        },
      ],
    }],
    missions: [
      { id: 'story-add-friend', title: 'Meet the wizard', description: 'Click a character who helps tell your story.', kind: 'object_present', objectId: 'story-friend' },
      { id: 'story-make-talk', title: 'Share a clue', description: 'Use a say block to give your explorer a new clue.', kind: 'block_present', blockType: 'say' },
      { id: 'story-play', title: 'Explore the castle', description: 'Press Play, click the wizard, and find the royal stars.', kind: 'play_started' },
    ],
  },
  {
    id: 'pet',
    version: 1,
    active: true,
    title: 'Happy Pet Park',
    description: 'Take a playful puppy through the park and fetch a sparkling ball.',
    genre: 'Pet world',
    cardArt: '/backdrops/farm.svg',
    budgets: { ...CONSERVATIVE_BUDGETS },
    scenes: [{
      id: 'pet-park',
      name: 'Pet Park',
      backgroundColor: '#d8f7cf',
      backgroundImageUrl: '/backdrops/farm.svg',
      objects: [
        {
          id: 'pet-puppy',
          name: 'Puppy',
          type: 'character',
          playerControlled: true,
          position: [0, 0, 0],
          modelUrl: '/models/starters/puppy.glb',
          shape: 'model',
          blocks: [
            ...playerBlocks('pet-puppy', 'Puppy', 500),
            { id: 'pet-puppy-space', block_type: 'on_key_press', inputs: { key: 'SPACE' } },
            { id: 'pet-puppy-jump', block_type: 'jump' },
            { id: 'pet-puppy-jump-sound', block_type: 'play_sound', inputs: { sound: 'jump' } },
          ],
        },
        { id: 'pet-music', name: 'Park Beat', type: 'sound', position: [0, -1, 0], properties: { autoplay_beat: true, beat: 'simple', bpm: 112 }, blocks: [] },
        { id: 'pet-lawn', name: 'Sunny Lawn', type: 'platform', position: [0, -1, 0], shape: 'box', color: '#65a30d', properties: { size: { width: 1200, height: 750 } }, blocks: [] },
        { id: 'pet-treat-lawn', name: 'Treat Lawn', type: 'platform', position: [10, -1, 0], shape: 'box', color: '#84cc16', properties: { size: { width: 1200, height: 750 } }, blocks: [] },
        { id: 'pet-butterfly-lawn', name: 'Butterfly Lawn', type: 'platform', position: [20, -1, 0], shape: 'box', color: '#a3e635', properties: { size: { width: 1200, height: 750 } }, blocks: [] },
        { id: 'pet-fetch-lawn', name: 'Fetch Lawn', type: 'platform', position: [30, -1, 0], shape: 'box', color: '#65a30d', properties: { size: { width: 1200, height: 750 } }, blocks: [] },
        {
          id: 'pet-friend',
          name: 'Park Pal',
          type: 'character',
          position: [7, 0, -2],
          modelUrl: '/models/starters/dog.glb',
          shape: 'model',
          blocks: [
            { id: 'pet-friend-click', block_type: 'when_clicked' },
            { id: 'pet-friend-bark', block_type: 'play_sound', inputs: { sound: 'bark' } },
            { id: 'pet-friend-say', block_type: 'say', inputs: { text: 'Woof! Find both treats, then fetch the sparkling ball!' } },
          ],
        },
        { id: 'pet-tree', name: 'Shady Park Tree', type: 'sprite', position: [18, 0, 3], modelUrl: '/models/starters/tree.glb', shape: 'model', blocks: [] },
        {
          id: 'pet-treat-one',
          name: 'Crunchy Treat One',
          type: 'collectible',
          position: [13, -0.75, -2],
          shape: 'sphere',
          color: '#f59e0b',
          blocks: [
            { id: 'pet-treat-one-touch', block_type: 'when_touches', inputs: { target: 'Puppy' } },
            { id: 'pet-treat-one-say', block_type: 'say', inputs: { text: 'Yum! One treat found.' } },
            { id: 'pet-treat-one-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'pet-treat-one-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'pet-treat-two',
          name: 'Crunchy Treat Two',
          type: 'collectible',
          position: [25, -0.75, -2],
          shape: 'sphere',
          color: '#f97316',
          blocks: [
            { id: 'pet-treat-two-touch', block_type: 'when_touches', inputs: { target: 'Puppy' } },
            { id: 'pet-treat-two-say', block_type: 'say', inputs: { text: 'Yum! The fetch ball is close.' } },
            { id: 'pet-treat-two-sound', block_type: 'play_sound', inputs: { sound: 'pickup' } },
            { id: 'pet-treat-two-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'pet-ball',
          name: 'Sparkle Ball',
          type: 'collectible',
          position: [35, -0.75, -2],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'pet-ball-touch', block_type: 'when_touches', inputs: { target: 'Puppy' } },
            { id: 'pet-ball-fanfare', block_type: 'play_sound', inputs: { sound: 'fanfare' } },
            { id: 'pet-ball-win', block_type: 'you_win', inputs: { message: 'Your puppy found the sparkling ball!' } },
          ],
        },
      ],
    }],
    missions: [
      { id: 'pet-add-toy', title: 'Choose a toy', description: 'Add a fun collectible for your pet to fetch.', kind: 'object_present', objectId: 'pet-ball' },
      { id: 'pet-make-happy', title: 'Make a happy sound', description: 'Add a sound block when your pet finds a treat.', kind: 'block_present', blockType: 'play_sound' },
      { id: 'pet-play', title: 'Play fetch', description: 'Press Play, find both treats, then fetch the ball.', kind: 'play_started' },
    ],
  },
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** The immutable approved catalog. Call getWorldTemplate before materializing a project. */
export const WORLD_TEMPLATES: readonly WorldTemplate[] = deepFreeze(WORLD_TEMPLATE_SOURCE);

/**
 * Return a new immutable value so callers cannot mutate the shared catalog or
 * accidentally hand a mutable template to a project-materialization flow.
 */
export function getWorldTemplate(id: string, version: number): WorldTemplate | null {
  const template = WORLD_TEMPLATES.find((candidate) => candidate.id === id && candidate.version === version);
  return template ? deepFreeze(JSON.parse(JSON.stringify(template)) as WorldTemplate) : null;
}

/**
 * Catalog entries suitable for the public discovery surfaces. Historic
 * template versions remain available to existing projects, but only the
 * current approved starter for each family is advertised to new creators.
 */
export function listActiveWorldTemplates(): readonly WorldTemplate[] {
  return deepFreeze(
    WORLD_TEMPLATES
      .filter((template) => template.active)
      .map((template) => JSON.parse(JSON.stringify(template)) as WorldTemplate),
  );
}
