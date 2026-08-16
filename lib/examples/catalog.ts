/**
 * Complete example games, seeded into the gallery so a child can play them and
 * hit Remix to take them apart.
 *
 * The tutorials teach one idea each and nobody ever sees a finished game. These
 * are the answer to "what can I actually build with this" — every one is a
 * playable thing, not a snippet.
 *
 * Pure data, no imports, so `tsc` can compile it for the validation test. That
 * test is the point of keeping it as data: an example that references a block
 * which does not exist would look fine here, seed fine, and do nothing when a
 * child pressed Play.
 *
 * **Block shape matters and is easy to get wrong.** A hat block takes the
 * blocks that FOLLOW it in the array as its script — it does not nest them.
 * Only C-blocks (`forever`, `repeat`, `if_then`) use `children`. Writing a hat
 * with `children` produces a script the interpreter silently ignores, which
 * cost me an afternoon before it was written down here.
 */

export interface ExampleBlock {
  block_type: string;
  inputs?: Record<string, unknown>;
  children?: ExampleBlock[];
}

export interface ExampleObject {
  name: string;
  type: 'character' | 'collectible' | 'obstacle' | 'platform';
  /** Starter id from CHARACTER_TEMPLATES, or a primitive shape. */
  starter?: string;
  shape?: string;
  color?: string;
  position: [number, number, number];
  blocks: ExampleBlock[];
}

export interface ExampleGame {
  /** Stable id: re-seeding updates the same project instead of duplicating. */
  id: string;
  title: string;
  description: string;
  /** One line on the card, aimed at a child. */
  tagline: string;
  /** What a child can learn by opening it. */
  teaches: string[];
  difficulty: 'easy' | 'medium' | 'harder';
  objects: ExampleObject[];
}

export const EXAMPLE_GAMES: ExampleGame[] = [
  {
    id: 'coin-rush',
    title: 'Coin Rush',
    description:
      'Run around and grab every coin before the timer runs out. Each coin sparkles when you catch it.',
    tagline: 'Collect the coins — they sparkle when you get one!',
    teaches: ['variables', 'clones', 'touching', 'particles', 'camera follow', 'sound'],
    difficulty: 'easy',
    objects: [
      {
        name: 'Hero',
        type: 'character',
        starter: 'hero',
        position: [0, 0, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'camera_follow', inputs: { target: 'Hero' } },
          { block_type: 'set_variable', inputs: { name: 'score', value: 0, scope: 'global' } },
          { block_type: 'show_variable', inputs: { name: 'score', scope: 'global' } },

          { block_type: 'on_key_press', inputs: { key: 'ArrowUp' } },
          { block_type: 'move', inputs: { direction: 'up', distance: 120 } },

          { block_type: 'on_key_press', inputs: { key: 'ArrowDown' } },
          { block_type: 'move', inputs: { direction: 'down', distance: 120 } },

          { block_type: 'on_key_press', inputs: { key: 'ArrowLeft' } },
          { block_type: 'move', inputs: { direction: 'left', distance: 120 } },

          { block_type: 'on_key_press', inputs: { key: 'ArrowRight' } },
          { block_type: 'move', inputs: { direction: 'right', distance: 120 } },
        ],
      },
      {
        name: 'Coin',
        type: 'collectible',
        starter: 'star',
        position: [3, 0, 2],
        blocks: [
          { block_type: 'on_start' },
          {
            block_type: 'repeat',
            inputs: { times: 6 },
            children: [{ block_type: 'create_clone_of' }],
          },
          { block_type: 'hide' },

          { block_type: 'when_clone_start' },
          {
            block_type: 'goto_xyz',
            inputs: {
              x: { op: 'random', args: [-6, 6] },
              y: 0,
              z: { op: 'random', args: [-6, 6] },
            },
          },
          { block_type: 'show' },
          {
            block_type: 'forever',
            children: [{ block_type: 'rotate', inputs: { x: 0, y: 3, z: 0 } }],
          },

          { block_type: 'when_touches', inputs: { target: 'Hero' } },
          { block_type: 'burst_particles', inputs: { effect: 'sparkle' } },
          { block_type: 'play_sound', inputs: { sound: 'coin' } },
          { block_type: 'change_variable', inputs: { name: 'score', value: 1, scope: 'global' } },
          { block_type: 'show_message', inputs: { text: 'Nice!', seconds: 1 } },
          { block_type: 'delete_clone' },
        ],
      },
    ],
  },

  {
    id: 'asteroid-dodge',
    title: 'Asteroid Dodge',
    description:
      'Rocks fall from the sky. Dodge them for as long as you can — one hit and it is over.',
    tagline: 'Dodge the falling rocks. How long can you last?',
    teaches: ['clones', 'gravity', 'collision', 'explosion particles', 'camera shake', 'game over'],
    difficulty: 'medium',
    objects: [
      {
        name: 'Ship',
        type: 'character',
        starter: 'rocket',
        position: [0, 0, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'set_variable', inputs: { name: 'time survived', value: 0, scope: 'global' } },
          { block_type: 'show_variable', inputs: { name: 'time survived', scope: 'global' } },
          { block_type: 'start_particles', inputs: { effect: 'fire' } },
          {
            block_type: 'forever',
            children: [
              { block_type: 'wait', inputs: { seconds: 1 } },
              { block_type: 'change_variable', inputs: { name: 'time survived', value: 1, scope: 'global' } },
            ],
          },

          { block_type: 'on_key_press', inputs: { key: 'ArrowLeft' } },
          { block_type: 'move', inputs: { direction: 'left', distance: 180 } },

          { block_type: 'on_key_press', inputs: { key: 'ArrowRight' } },
          { block_type: 'move', inputs: { direction: 'right', distance: 180 } },
        ],
      },
      {
        name: 'Rock',
        type: 'obstacle',
        starter: 'rock',
        position: [0, 6, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'hide' },
          {
            block_type: 'forever',
            children: [
              { block_type: 'wait', inputs: { seconds: 0.8 } },
              { block_type: 'create_clone_of' },
            ],
          },

          { block_type: 'when_clone_start' },
          {
            block_type: 'goto_xyz',
            inputs: { x: { op: 'random', args: [-7, 7] }, y: 7, z: 0 },
          },
          { block_type: 'show' },
          {
            block_type: 'repeat',
            inputs: { times: 60 },
            children: [
              { block_type: 'change_xyz', inputs: { dx: 0, dy: -0.18, dz: 0 } },
              { block_type: 'rotate', inputs: { x: 2, y: 1, z: 0 } },
            ],
          },
          { block_type: 'delete_clone' },

          { block_type: 'when_touches', inputs: { target: 'Ship' } },
          { block_type: 'burst_particles', inputs: { effect: 'explosion' } },
          { block_type: 'camera_shake', inputs: { strength: 2, seconds: 0.6 } },
          { block_type: 'game_over', inputs: { message: 'The rocks got you!' } },
        ],
      },
    ],
  },

  {
    id: 'magic-painter',
    title: 'Magic Painter',
    description:
      'Draw glowing spirals with the pen while magic sparkles trail behind. Change the numbers to make a different shape every time.',
    tagline: 'Draw glowing shapes that paint themselves.',
    teaches: ['pen', 'loops', 'operators', 'particle trails'],
    difficulty: 'medium',
    objects: [
      {
        name: 'Painter',
        type: 'character',
        starter: 'wizard',
        position: [0, 0, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'pen_clear' },
          { block_type: 'set_variable', inputs: { name: 'hue', value: 0, scope: 'global' } },
          { block_type: 'start_particles', inputs: { effect: 'magic' } },
          { block_type: 'pen_down' },
          {
            block_type: 'repeat',
            inputs: { times: 120 },
            children: [
              { block_type: 'change_variable', inputs: { name: 'hue', value: 3, scope: 'global' } },
              { block_type: 'move', inputs: { direction: 'up', distance: 60 } },
              { block_type: 'rotate', inputs: { x: 0, y: 13, z: 0 } },
            ],
          },
          { block_type: 'pen_up' },
          { block_type: 'say', inputs: { text: 'Ta-da!', seconds: 2 } },
        ],
      },
    ],
  },

  {
    id: 'talking-robot',
    title: 'Talking Robot',
    description:
      'A robot that asks your name, answers your questions with AI, and says it out loud in another language.',
    tagline: 'Ask the robot anything — it answers out loud.',
    teaches: ['ask and wait', 'AI', 'text to speech', 'translate'],
    difficulty: 'harder',
    objects: [
      {
        name: 'Robot',
        type: 'character',
        starter: 'robot',
        position: [0, 0, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'start_particles', inputs: { effect: 'bubbles' } },
          { block_type: 'ask_and_wait', inputs: { prompt: "What's your name?" } },
          { block_type: 'set_variable', inputs: { name: 'name', value: { op: 'answer' }, scope: 'global' } },
          {
            block_type: 'say',
            inputs: { text: { op: 'join', args: ['Hello, ', { op: 'var', value: 'name' }] }, seconds: 2 },
          },
          { block_type: 'ask_and_wait', inputs: { prompt: 'Ask me anything!' } },
          { block_type: 'ask_ai', inputs: { prompt: { op: 'answer' }, into_var: 'reply' } },
          { block_type: 'say', inputs: { text: { op: 'var', value: 'reply' }, seconds: 4 } },
          { block_type: 'speak', inputs: { text: { op: 'var', value: 'reply' } } },
          {
            block_type: 'translate_to',
            inputs: { text: { op: 'var', value: 'reply' }, language: 'Spanish', into_var: 'spanish' },
          },
          { block_type: 'say', inputs: { text: { op: 'var', value: 'spanish' }, seconds: 4 } },
          { block_type: 'burst_particles', inputs: { effect: 'confetti' } },
        ],
      },
    ],
  },
];

/** Every block type an example uses, for validation against the real palette. */
export function exampleBlockTypes(): string[] {
  const out = new Set<string>();
  const walk = (blocks: ExampleBlock[]) => {
    for (const b of blocks) {
      out.add(b.block_type);
      if (b.children) walk(b.children);
    }
  };
  for (const game of EXAMPLE_GAMES) for (const obj of game.objects) walk(obj.blocks);
  return Array.from(out).sort();
}

/** Every starter id an example depends on. */
export function exampleStarters(): string[] {
  const out = new Set<string>();
  for (const game of EXAMPLE_GAMES) {
    for (const obj of game.objects) if (obj.starter) out.add(obj.starter);
  }
  return Array.from(out).sort();
}
