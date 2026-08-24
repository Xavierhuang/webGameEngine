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
          ],
        },
        { id: 'sky-start-island', name: 'Starting Island', type: 'platform', position: [0, -2, 0], shape: 'box', color: '#4f8f44', blocks: [] },
        { id: 'sky-step-one', name: 'Sky Step One', type: 'platform', position: [16, -1, 0], shape: 'box', color: '#74b65d', blocks: [] },
        { id: 'sky-step-two', name: 'Sky Step Two', type: 'platform', position: [32, 0, 0], shape: 'box', color: '#74b65d', blocks: [] },
        { id: 'sky-extra-platform', name: 'Sky Step Three', type: 'platform', position: [48, 1, 0], shape: 'box', color: '#74b65d', blocks: [] },
        {
          id: 'sky-star-one',
          name: 'Sky Star One',
          type: 'collectible',
          position: [16, -0.75, 0],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'sky-star-one-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
            { id: 'sky-star-one-say', block_type: 'say', inputs: { text: 'Star collected!' } },
            { id: 'sky-star-one-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'sky-star-two',
          name: 'Sky Star Two',
          type: 'collectible',
          position: [32, 0.25, 0],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'sky-star-two-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
            { id: 'sky-star-two-say', block_type: 'say', inputs: { text: 'Star collected!' } },
            { id: 'sky-star-two-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'sky-extra-star',
          name: 'Sky Star Three',
          type: 'collectible',
          position: [48, 1.25, 0],
          modelUrl: '/models/starters/star.glb',
          shape: 'model',
          blocks: [
            { id: 'sky-star-three-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
            { id: 'sky-star-three-say', block_type: 'say', inputs: { text: 'Star collected!' } },
            { id: 'sky-star-three-hide', block_type: 'hide' },
          ],
        },
        {
          id: 'sky-moving-cloud',
          name: 'Moving Cloud',
          type: 'obstacle',
          position: [36, 2, 1],
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
          position: [48, 1.25, 0],
          shape: 'torus',
          color: '#fbbf24',
          blocks: [
            { id: 'sky-portal-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
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
        { id: 'obby-runner', name: 'Runner', type: 'character', playerControlled: true, position: [0, 0, 0], modelUrl: '/models/starters/ninja.glb', shape: 'model', blocks: playerBlocks('obby-runner', 'Runner') },
        { id: 'obby-ground', name: 'Start Pad', type: 'platform', position: [0, -1, 0], shape: 'box', color: '#f472b6', blocks: [] },
        { id: 'obby-bumper', name: 'Bouncy Bumper', type: 'obstacle', position: [3, 0, 0], shape: 'sphere', color: '#fbbf24', blocks: [
          { id: 'obby-bumper-spin', block_type: 'forever', children: [{ id: 'obby-bumper-turn', block_type: 'rotate', inputs: { x: 0, y: 5, z: 0 } }] },
        ] },
        { id: 'obby-finish', name: 'Finish Star', type: 'collectible', position: [6, 0, 0], modelUrl: '/models/starters/star.glb', shape: 'model', blocks: [
          { id: 'obby-finish-touch', block_type: 'when_touches', inputs: { target: 'Runner' } },
          { id: 'obby-finish-win', block_type: 'you_win', inputs: { message: 'Obstacle course complete!' } },
        ] },
      ],
    }],
    missions: [
      { id: 'obby-place-platform', title: 'Place a platform', description: 'Add a safe place for your runner to land.', kind: 'object_present', objectId: 'obby-ground' },
      { id: 'obby-make-move', title: 'Make a move', description: 'Add a move block for your runner.', kind: 'block_present', blockType: 'move' },
      { id: 'obby-play', title: 'Race the course', description: 'Press Play and test your obstacle path.', kind: 'play_started' },
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
        { id: 'racing-car', name: 'Speedy Car', type: 'character', playerControlled: true, position: [0, 0, 0], modelUrl: '/models/starters/car.glb', shape: 'model', blocks: playerBlocks('racing-car', 'Speedy Car') },
        { id: 'racing-road', name: 'Race Road', type: 'platform', position: [0, -1, 0], shape: 'box', color: '#475569', blocks: [] },
        { id: 'racing-finish', name: 'Finish Flag', type: 'collectible', position: [7, 0, 0], modelUrl: '/models/starters/star.glb', shape: 'model', blocks: [
          { id: 'racing-finish-touch', block_type: 'when_touches', inputs: { target: 'Speedy Car' } },
          { id: 'racing-finish-win', block_type: 'you_win', inputs: { message: 'First across the line!' } },
        ] },
      ],
    }],
    missions: [
      { id: 'racing-add-track', title: 'Build the track', description: 'Add another platform to make the road longer.', kind: 'object_present', objectId: 'racing-road' },
      { id: 'racing-add-sound', title: 'Add a sound', description: 'Try a sound block when your race begins.', kind: 'block_present', blockType: 'play_sound' },
      { id: 'racing-play', title: 'Test drive', description: 'Press Play and steer your car to the flag.', kind: 'play_started' },
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
        { id: 'story-explorer', name: 'Explorer', type: 'character', playerControlled: true, position: [0, 0, 0], modelUrl: '/models/starters/princess.glb', shape: 'model', blocks: playerBlocks('story-explorer', 'Explorer') },
        { id: 'story-courtyard', name: 'Castle Courtyard', type: 'platform', position: [0, -1, 0], shape: 'box', color: '#8b7b70', blocks: [] },
        { id: 'story-friend', name: 'Friendly Wizard', type: 'character', position: [3, 0, 0], modelUrl: '/models/starters/wizard.glb', shape: 'model', blocks: [
          { id: 'story-friend-click', block_type: 'when_clicked' },
          { id: 'story-friend-say', block_type: 'say', inputs: { text: 'The treasure is near the old tower!' } },
        ] },
        { id: 'story-treasure', name: 'Treasure Star', type: 'collectible', position: [6, 0, 0], modelUrl: '/models/starters/star.glb', shape: 'model', blocks: [
          { id: 'story-treasure-touch', block_type: 'when_touches', inputs: { target: 'Explorer' } },
          { id: 'story-treasure-win', block_type: 'you_win', inputs: { message: 'You found the treasure!' } },
        ] },
      ],
    }],
    missions: [
      { id: 'story-add-friend', title: 'Meet a friend', description: 'Add a character to help tell your story.', kind: 'object_present', objectId: 'story-friend' },
      { id: 'story-make-talk', title: 'Make someone talk', description: 'Use a say block to share a clue.', kind: 'block_present', blockType: 'say' },
      { id: 'story-play', title: 'Read your story', description: 'Press Play and explore the castle.', kind: 'play_started' },
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
        { id: 'pet-puppy', name: 'Puppy', type: 'character', playerControlled: true, position: [0, 0, 0], modelUrl: '/models/starters/puppy.glb', shape: 'model', blocks: playerBlocks('pet-puppy', 'Puppy') },
        { id: 'pet-lawn', name: 'Park Lawn', type: 'platform', position: [0, -1, 0], shape: 'box', color: '#65a30d', blocks: [] },
        { id: 'pet-ball', name: 'Sparkle Ball', type: 'collectible', position: [4, 0, 0], modelUrl: '/models/starters/star.glb', shape: 'model', blocks: [
          { id: 'pet-ball-touch', block_type: 'when_touches', inputs: { target: 'Puppy' } },
          { id: 'pet-ball-sound', block_type: 'play_sound', inputs: { sound: 'pop' } },
          { id: 'pet-ball-win', block_type: 'you_win', inputs: { message: 'Your puppy found the ball!' } },
        ] },
      ],
    }],
    missions: [
      { id: 'pet-add-toy', title: 'Choose a toy', description: 'Add a fun collectible for your pet.', kind: 'object_present', objectId: 'pet-ball' },
      { id: 'pet-make-happy', title: 'Make a happy sound', description: 'Add a sound block when your pet finds a toy.', kind: 'block_present', blockType: 'play_sound' },
      { id: 'pet-play', title: 'Play fetch', description: 'Press Play and help your puppy find the ball.', kind: 'play_started' },
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
