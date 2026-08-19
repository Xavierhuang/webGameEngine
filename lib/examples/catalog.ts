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

  /*
   * Everything below covers an archetype the first four never touched. The
   * original set demonstrated collecting, dodging, drawing and talking — which
   * left lists, music, clones-at-scale, click input, scene-free storytelling
   * and hand-rolled physics with nothing showing a child they exist.
   */

  {
    id: 'star-racer',
    title: 'Star Racer',
    description:
      'Drive through all five rings before the clock beats you. The camera chases the car.',
    tagline: 'Grab all five rings as fast as you can!',
    teaches: ['camera follow', 'the timer', 'clones', 'winning', 'variables'],
    difficulty: 'easy',
    objects: [
      {
        name: 'Racer',
        type: 'character',
        starter: 'car',
        position: [0, 0, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'camera_follow', inputs: { target: 'Racer' } },
          { block_type: 'reset_timer' },
          { block_type: 'set_variable', inputs: { name: 'rings', value: 0, scope: 'global' } },
          { block_type: 'show_variable', inputs: { name: 'rings', scope: 'global' } },
          { block_type: 'show_message', inputs: { text: 'Drive through all 5 rings!', seconds: 3 } },
          {
            block_type: 'forever',
            children: [
              {
                block_type: 'if_then',
                inputs: { condition: { op: 'gte', args: [{ op: 'var', value: 'rings' }, 5] } },
                children: [{ block_type: 'you_win', inputs: { message: 'Track complete!' } }],
              },
            ],
          },

          { block_type: 'on_key_press', inputs: { key: 'ArrowUp' } },
          { block_type: 'move', inputs: { direction: 'up', distance: 220 } },
          { block_type: 'on_key_press', inputs: { key: 'ArrowDown' } },
          { block_type: 'move', inputs: { direction: 'down', distance: 220 } },
          { block_type: 'on_key_press', inputs: { key: 'ArrowLeft' } },
          { block_type: 'move', inputs: { direction: 'left', distance: 220 } },
          { block_type: 'on_key_press', inputs: { key: 'ArrowRight' } },
          { block_type: 'move', inputs: { direction: 'right', distance: 220 } },
        ],
      },
      {
        name: 'Ring',
        type: 'collectible',
        starter: 'star',
        position: [4, 0, 4],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'repeat', inputs: { times: 5 }, children: [{ block_type: 'create_clone_of' }] },
          { block_type: 'hide' },

          { block_type: 'when_clone_start' },
          {
            block_type: 'goto_xyz',
            inputs: { x: { op: 'random', args: [-8, 8] }, y: 0, z: { op: 'random', args: [-8, 8] } },
          },
          { block_type: 'show' },
          { block_type: 'forever', children: [{ block_type: 'rotate', inputs: { x: 0, y: 4, z: 0 } }] },

          { block_type: 'when_touches', inputs: { target: 'Racer' } },
          { block_type: 'burst_particles', inputs: { effect: 'sparkle' } },
          { block_type: 'play_sound', inputs: { sound: 'coin' } },
          { block_type: 'change_variable', inputs: { name: 'rings', value: 1, scope: 'global' } },
          { block_type: 'delete_clone' },
        ],
      },
    ],
  },

  {
    id: 'maze-escape',
    title: 'Maze Escape',
    description:
      'Find the key, then open the chest. Walk into a wall and the camera shakes at you.',
    tagline: 'Find the key. Open the chest. Escape.',
    teaches: ['touching', 'if / else logic', 'camera shake', 'locked doors', 'variables'],
    difficulty: 'medium',
    objects: [
      {
        name: 'Explorer',
        type: 'character',
        starter: 'explorer',
        position: [-7, 0, -7],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'camera_follow', inputs: { target: 'Explorer' } },
          { block_type: 'set_variable', inputs: { name: 'keys', value: 0, scope: 'global' } },
          { block_type: 'show_variable', inputs: { name: 'keys', scope: 'global' } },
          { block_type: 'show_message', inputs: { text: 'Find the key, then the chest.', seconds: 3 } },

          { block_type: 'on_key_press', inputs: { key: 'ArrowUp' } },
          { block_type: 'move', inputs: { direction: 'up', distance: 130 } },
          { block_type: 'on_key_press', inputs: { key: 'ArrowDown' } },
          { block_type: 'move', inputs: { direction: 'down', distance: 130 } },
          { block_type: 'on_key_press', inputs: { key: 'ArrowLeft' } },
          { block_type: 'move', inputs: { direction: 'left', distance: 130 } },
          { block_type: 'on_key_press', inputs: { key: 'ArrowRight' } },
          { block_type: 'move', inputs: { direction: 'right', distance: 130 } },

          { block_type: 'when_touches', inputs: { target: 'Wall' } },
          { block_type: 'camera_shake', inputs: { strength: 1, seconds: 0.3 } },
          { block_type: 'play_sound', inputs: { sound: 'hit' } },
          { block_type: 'show_message', inputs: { text: 'Ouch! Not through walls.', seconds: 1 } },
        ],
      },
      {
        name: 'Wall',
        type: 'obstacle',
        starter: 'rock',
        position: [0, 0, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'hide' },
          { block_type: 'repeat', inputs: { times: 10 }, children: [{ block_type: 'create_clone_of' }] },

          { block_type: 'when_clone_start' },
          {
            block_type: 'goto_xyz',
            inputs: { x: { op: 'random', args: [-8, 8] }, y: 0, z: { op: 'random', args: [-8, 8] } },
          },
          { block_type: 'show' },
        ],
      },
      {
        name: 'Key',
        type: 'collectible',
        starter: 'star',
        position: [7, 0, -6],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'show' },
          { block_type: 'forever', children: [{ block_type: 'rotate', inputs: { x: 0, y: 3, z: 0 } }] },

          { block_type: 'when_touches', inputs: { target: 'Explorer' } },
          { block_type: 'burst_particles', inputs: { effect: 'magic' } },
          { block_type: 'play_sound', inputs: { sound: 'powerup' } },
          { block_type: 'change_variable', inputs: { name: 'keys', value: 1, scope: 'global' } },
          { block_type: 'show_message', inputs: { text: 'You got the key!', seconds: 2 } },
          { block_type: 'hide' },
        ],
      },
      {
        name: 'Chest',
        type: 'collectible',
        starter: 'chest',
        position: [7, 0, 7],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'show' },

          { block_type: 'when_touches', inputs: { target: 'Explorer' } },
          {
            // Two separate ifs rather than if/else: the example format carries
            // only `children`, and a locked chest and an opened one are
            // genuinely different reactions rather than two halves of one.
            block_type: 'if_then',
            inputs: { condition: { op: 'gte', args: [{ op: 'var', value: 'keys' }, 1] } },
            children: [
              { block_type: 'burst_particles', inputs: { effect: 'confetti' } },
              { block_type: 'play_sound', inputs: { sound: 'fanfare' } },
              { block_type: 'you_win', inputs: { message: 'You escaped the maze!' } },
            ],
          },
          {
            block_type: 'if_then',
            inputs: { condition: { op: 'lt', args: [{ op: 'var', value: 'keys' }, 1] } },
            children: [
              { block_type: 'play_sound', inputs: { sound: 'error' } },
              { block_type: 'say', inputs: { text: 'It is locked. Find the key!', seconds: 2 } },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'quiz-master',
    title: 'Quiz Master',
    description:
      'An owl asks three questions and keeps score. Change the list to ask about anything you like.',
    tagline: 'Answer the owl’s three questions.',
    teaches: ['lists', 'ask and wait', 'comparing answers', 'score keeping'],
    difficulty: 'medium',
    objects: [
      {
        name: 'Quizmaster',
        type: 'character',
        starter: 'owl',
        position: [0, 0, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'set_variable', inputs: { name: 'score', value: 0, scope: 'global' } },
          { block_type: 'show_variable', inputs: { name: 'score', scope: 'global' } },
          // The answers live in a list so a child can see the data behind the
          // game and edit it without touching a single block of logic.
          { block_type: 'delete_all_of_list', inputs: { name: 'answers', scope: 'global' } },
          { block_type: 'add_to_list', inputs: { item: '4', name: 'answers', scope: 'global' } },
          { block_type: 'add_to_list', inputs: { item: 'blue', name: 'answers', scope: 'global' } },
          { block_type: 'add_to_list', inputs: { item: '7', name: 'answers', scope: 'global' } },
          { block_type: 'show_list', inputs: { name: 'answers', scope: 'global' } },
          { block_type: 'say', inputs: { text: 'Three questions. Ready?', seconds: 2 } },

          { block_type: 'ask_and_wait', inputs: { prompt: 'What is 2 + 2?' } },
          { block_type: 'broadcast', inputs: { message: 'mark-1' } },
          { block_type: 'ask_and_wait', inputs: { prompt: 'What colour is the sky on a clear day?' } },
          { block_type: 'broadcast', inputs: { message: 'mark-2' } },
          { block_type: 'ask_and_wait', inputs: { prompt: 'How many days are in a week?' } },
          { block_type: 'broadcast', inputs: { message: 'mark-3' } },
          { block_type: 'wait', inputs: { seconds: 1 } },
          {
            block_type: 'if_then',
            inputs: { condition: { op: 'gte', args: [{ op: 'var', value: 'score' }, 2] } },
            children: [{ block_type: 'you_win', inputs: { message: 'Quiz passed!' } }],
          },
          {
            block_type: 'if_then',
            inputs: { condition: { op: 'lt', args: [{ op: 'var', value: 'score' }, 2] } },
            children: [{ block_type: 'game_over', inputs: { message: 'Have another go!' } }],
          },

          { block_type: 'when_receive', inputs: { message: 'mark-1' } },
          { block_type: 'broadcast', inputs: { message: 'check-1' } },

          // One marker per question, each comparing the answer against its
          // list entry. Written out rather than looped so a child can read
          // exactly what "marking" means.
          { block_type: 'when_receive', inputs: { message: 'check-1' } },
          {
            block_type: 'if_then',
            inputs: {
              condition: {
                op: 'eq',
                args: [{ op: 'answer' }, { op: 'list_item', value: 'answers', args: [1] }],
              },
            },
            children: [
              { block_type: 'change_variable', inputs: { name: 'score', value: 1, scope: 'global' } },
              { block_type: 'play_sound', inputs: { sound: 'confirm' } },
              { block_type: 'say', inputs: { text: 'Correct!', seconds: 1 } },
            ],
          },

          { block_type: 'when_receive', inputs: { message: 'mark-2' } },
          {
            block_type: 'if_then',
            inputs: {
              condition: {
                op: 'eq',
                args: [{ op: 'answer' }, { op: 'list_item', value: 'answers', args: [2] }],
              },
            },
            children: [
              { block_type: 'change_variable', inputs: { name: 'score', value: 1, scope: 'global' } },
              { block_type: 'play_sound', inputs: { sound: 'confirm' } },
              { block_type: 'say', inputs: { text: 'Correct!', seconds: 1 } },
            ],
          },

          { block_type: 'when_receive', inputs: { message: 'mark-3' } },
          {
            block_type: 'if_then',
            inputs: {
              condition: {
                op: 'eq',
                args: [{ op: 'answer' }, { op: 'list_item', value: 'answers', args: [3] }],
              },
            },
            children: [
              { block_type: 'change_variable', inputs: { name: 'score', value: 1, scope: 'global' } },
              { block_type: 'play_sound', inputs: { sound: 'confirm' } },
              { block_type: 'say', inputs: { text: 'Correct!', seconds: 1 } },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'drum-machine',
    title: 'Drum Machine',
    description:
      'A robot plays a marimba loop forever. Hold A, S or D to add drums over the top.',
    tagline: 'Play along with the robot band.',
    teaches: ['notes and drums', 'tempo', 'instruments', 'loops', 'key presses'],
    difficulty: 'easy',
    objects: [
      {
        name: 'Drummer',
        type: 'character',
        starter: 'robot',
        position: [0, 0, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'set_tempo', inputs: { tempo: 100 } },
          { block_type: 'set_instrument', inputs: { instrument: 'marimba' } },
          { block_type: 'set_variable', inputs: { name: 'beats played', value: 0, scope: 'global' } },
          { block_type: 'show_variable', inputs: { name: 'beats played', scope: 'global' } },
          { block_type: 'show_message', inputs: { text: 'Hold A, S or D to drum!', seconds: 4 } },
          {
            // A four-note riff on repeat. Change the numbers and the tune
            // changes — the shortest route from "a block" to "I made music".
            block_type: 'forever',
            children: [
              { block_type: 'play_note', inputs: { note: 60, beats: 0.5 } },
              { block_type: 'play_note', inputs: { note: 64, beats: 0.5 } },
              { block_type: 'play_note', inputs: { note: 67, beats: 0.5 } },
              { block_type: 'play_note', inputs: { note: 64, beats: 0.5 } },
              { block_type: 'rest_for_beats', inputs: { beats: 0.5 } },
              // Counting on screen turns an invisible loop into something a
              // child can watch happening.
              { block_type: 'change_variable', inputs: { name: 'beats played', value: 4, scope: 'global' } },
            ],
          },

          { block_type: 'on_key_press', inputs: { key: 'a' } },
          { block_type: 'play_drum', inputs: { drum: 'bass', beats: 0.25 } },
          { block_type: 'on_key_press', inputs: { key: 's' } },
          { block_type: 'play_drum', inputs: { drum: 'snare', beats: 0.25 } },
          { block_type: 'on_key_press', inputs: { key: 'd' } },
          { block_type: 'play_drum', inputs: { drum: 'closed-hat', beats: 0.25 } },
        ],
      },
      {
        name: 'Dancer',
        type: 'character',
        starter: 'penguin',
        position: [3, 0, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'start_particles', inputs: { effect: 'confetti' } },
          {
            block_type: 'forever',
            children: [
              { block_type: 'change_size_by', inputs: { delta: 8 } },
              { block_type: 'wait', inputs: { seconds: 0.3 } },
              { block_type: 'change_size_by', inputs: { delta: -8 } },
              { block_type: 'wait', inputs: { seconds: 0.3 } },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'bounce-lab',
    title: 'Bounce Lab',
    description:
      'A ball falls, squashes and bounces — built entirely out of a variable and some arithmetic.',
    tagline: 'Gravity made out of numbers. Change one and see.',
    teaches: ['variables as speed', 'arithmetic', 'reading your own position', 'sound on impact'],
    difficulty: 'harder',
    objects: [
      {
        name: 'Ball',
        type: 'collectible',
        starter: 'star',
        position: [0, 6, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'show_message', inputs: { text: 'Gravity is just a number. Open me!', seconds: 4 } },
          // `speed` is object-scoped, so a second ball would fall on its own
          // terms rather than sharing one global.
          { block_type: 'set_variable', inputs: { name: 'speed', value: 0, scope: 'object' } },
          { block_type: 'show_variable', inputs: { name: 'speed', scope: 'object' } },
          { block_type: 'goto_xyz', inputs: { x: 0, y: 6, z: 0 } },
          {
            block_type: 'forever',
            children: [
              // Gravity: pull the speed down a little every frame.
              { block_type: 'change_variable', inputs: { name: 'speed', value: -0.015, scope: 'object' } },
              { block_type: 'change_xyz', inputs: { dx: 0, dy: { op: 'var', value: 'speed' }, dz: 0 } },
              {
                // Hit the floor: reverse and lose a little energy, which is
                // why the bounces get smaller on their own.
                block_type: 'if_then',
                inputs: { condition: { op: 'lte', args: [{ op: 'position_y' }, 0] } },
                children: [
                  { block_type: 'set_y', inputs: { value: 0 } },
                  {
                    block_type: 'set_variable',
                    inputs: {
                      name: 'speed',
                      value: { op: 'mul', args: [{ op: 'abs', args: [{ op: 'var', value: 'speed' }] }, 0.82] },
                      scope: 'object',
                    },
                  },
                  { block_type: 'play_sound', inputs: { sound: 'boing' } },
                  { block_type: 'burst_particles', inputs: { effect: 'smoke' } },
                ],
              },
              {
                // Once it has stopped bouncing, throw it back up so the lab
                // never just sits there.
                block_type: 'if_then',
                inputs: {
                  condition: {
                    op: 'and',
                    args: [
                      { op: 'lte', args: [{ op: 'position_y' }, 0.05] },
                      { op: 'lt', args: [{ op: 'abs', args: [{ op: 'var', value: 'speed' }] }, 0.05] },
                    ],
                  },
                },
                children: [
                  { block_type: 'set_variable', inputs: { name: 'speed', value: 0.35, scope: 'object' } },
                  { block_type: 'play_sound', inputs: { sound: 'powerup' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'star-tapper',
    title: 'Star Tapper',
    description:
      'Click the star as many times as you can. It grows, spins and throws confetti every tap.',
    tagline: 'Tap the star 25 times to win.',
    teaches: ['when this is clicked', 'counting', 'growing things', 'winning'],
    difficulty: 'easy',
    objects: [
      {
        name: 'Star',
        type: 'collectible',
        starter: 'star',
        position: [0, 1, 0],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'set_variable', inputs: { name: 'taps', value: 0, scope: 'global' } },
          { block_type: 'show_variable', inputs: { name: 'taps', scope: 'global' } },
          { block_type: 'set_size', inputs: { pct: 100 } },
          { block_type: 'show_message', inputs: { text: 'Click the star!', seconds: 3 } },
          { block_type: 'forever', children: [{ block_type: 'rotate', inputs: { x: 0, y: 2, z: 0 } }] },

          // The only example driven by the mouse rather than the keyboard.
          { block_type: 'when_clicked' },
          { block_type: 'change_variable', inputs: { name: 'taps', value: 1, scope: 'global' } },
          { block_type: 'change_size_by', inputs: { delta: 4 } },
          { block_type: 'play_sound', inputs: { sound: 'pop' } },
          { block_type: 'burst_particles', inputs: { effect: 'confetti' } },
          {
            block_type: 'if_then',
            inputs: { condition: { op: 'gte', args: [{ op: 'var', value: 'taps' }, 25] } },
            children: [
              { block_type: 'play_sound', inputs: { sound: 'levelup' } },
              { block_type: 'you_win', inputs: { message: '25 taps! Star fully charged.' } },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'space-defender',
    title: 'Space Defender',
    description:
      'Aliens drift in, you shoot them down. Every bolt and every alien is a clone.',
    tagline: 'Space to fire. Arrows to dodge.',
    teaches: ['clones at scale', 'broadcasts', 'collisions', 'explosions', 'game over'],
    difficulty: 'harder',
    objects: [
      {
        name: 'Ship',
        type: 'character',
        starter: 'rocket',
        position: [0, 0, 6],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'set_variable', inputs: { name: 'shot down', value: 0, scope: 'global' } },
          { block_type: 'show_variable', inputs: { name: 'shot down', scope: 'global' } },
          { block_type: 'start_particles', inputs: { effect: 'fire' } },
          { block_type: 'show_message', inputs: { text: 'Space to fire!', seconds: 3 } },
          {
            block_type: 'forever',
            children: [
              {
                block_type: 'if_then',
                inputs: { condition: { op: 'gte', args: [{ op: 'var', value: 'shot down' }, 12] } },
                children: [{ block_type: 'you_win', inputs: { message: 'Sector cleared!' } }],
              },
            ],
          },

          { block_type: 'on_key_press', inputs: { key: 'ArrowLeft' } },
          { block_type: 'move', inputs: { direction: 'left', distance: 200 } },
          { block_type: 'on_key_press', inputs: { key: 'ArrowRight' } },
          { block_type: 'move', inputs: { direction: 'right', distance: 200 } },

          // The firing key only broadcasts. The Bolt owns what a shot *is*,
          // which is what lets one key press make an unlimited number of them.
          { block_type: 'on_key_press', inputs: { key: 'SPACE' } },
          { block_type: 'broadcast', inputs: { message: 'fire' } },

          { block_type: 'when_touches', inputs: { target: 'Alien' } },
          { block_type: 'burst_particles', inputs: { effect: 'explosion' } },
          { block_type: 'play_sound', inputs: { sound: 'gameover' } },
          { block_type: 'camera_shake', inputs: { strength: 2, seconds: 0.5 } },
          { block_type: 'game_over', inputs: { message: 'The aliens got through.' } },
        ],
      },
      {
        name: 'Bolt',
        type: 'obstacle',
        starter: 'star',
        position: [0, 0, 6],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'hide' },
          { block_type: 'set_size', inputs: { pct: 40 } },

          { block_type: 'when_receive', inputs: { message: 'fire' } },
          { block_type: 'create_clone_of' },

          { block_type: 'when_clone_start' },
          { block_type: 'goto_object', inputs: { target: 'Ship' } },
          { block_type: 'show' },
          { block_type: 'play_sound', inputs: { sound: 'laser' } },
          {
            block_type: 'repeat',
            inputs: { times: 45 },
            children: [{ block_type: 'change_xyz', inputs: { dx: 0, dy: 0, dz: -0.35 } }],
          },
          { block_type: 'delete_clone' },
        ],
      },
      {
        name: 'Alien',
        type: 'obstacle',
        starter: 'alien',
        position: [0, 0, -8],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'hide' },
          {
            block_type: 'forever',
            children: [
              { block_type: 'wait', inputs: { seconds: 1.4 } },
              { block_type: 'create_clone_of' },
            ],
          },

          { block_type: 'when_clone_start' },
          {
            block_type: 'goto_xyz',
            inputs: { x: { op: 'random', args: [-7, 7] }, y: 0, z: -9 },
          },
          { block_type: 'show' },
          {
            block_type: 'repeat',
            inputs: { times: 120 },
            children: [{ block_type: 'change_xyz', inputs: { dx: 0, dy: 0, dz: 0.12 } }],
          },
          { block_type: 'delete_clone' },

          { block_type: 'when_touches', inputs: { target: 'Bolt' } },
          { block_type: 'burst_particles', inputs: { effect: 'explosion' } },
          { block_type: 'play_sound', inputs: { sound: 'explosion' } },
          { block_type: 'change_variable', inputs: { name: 'shot down', value: 1, scope: 'global' } },
          { block_type: 'delete_clone' },
        ],
      },
    ],
  },

  {
    id: 'dragon-riddle',
    title: "The Dragon's Riddle",
    description:
      'A wizard sends you up the mountain. The dragon will only move for the right answer.',
    tagline: 'Answer the dragon’s riddle to pass.',
    teaches: ['broadcasts between characters', 'ask and wait', 'branching stories', 'text matching'],
    difficulty: 'medium',
    objects: [
      {
        name: 'Wizard',
        type: 'character',
        starter: 'wizard',
        position: [-3, 0, 2],
        blocks: [
          { block_type: 'on_start' },
          { block_type: 'start_particles', inputs: { effect: 'magic' } },
          { block_type: 'say', inputs: { text: 'A dragon guards the mountain pass...', seconds: 3 } },
          { block_type: 'say', inputs: { text: 'Only a riddle will move it. Go on.', seconds: 3 } },
          // The story advances by message, not by one long script — which is
          // how two characters take turns without either one waiting on the
          // other's timing.
          { block_type: 'broadcast', inputs: { message: 'approach' } },

          { block_type: 'when_receive', inputs: { message: 'riddle-solved' } },
          { block_type: 'say', inputs: { text: 'The pass is open. Well done!', seconds: 3 } },
          { block_type: 'burst_particles', inputs: { effect: 'confetti' } },
          { block_type: 'you_win', inputs: { message: 'The dragon lets you pass.' } },
        ],
      },
      {
        name: 'Dragon',
        type: 'character',
        starter: 'dragon',
        position: [3, 0, -2],
        blocks: [
          { block_type: 'when_receive', inputs: { message: 'approach' } },
          { block_type: 'play_sound', inputs: { sound: 'roar' } },
          { block_type: 'say', inputs: { text: 'Answer me this, small one.', seconds: 2 } },
          { block_type: 'ask_and_wait', inputs: { prompt: 'What has keys but opens no locks?' } },
          {
            block_type: 'if_then',
            inputs: {
              condition: { op: 'contains', args: [{ op: 'answer' }, 'piano'] },
            },
            children: [
              { block_type: 'say', inputs: { text: 'A piano. You may pass.', seconds: 3 } },
              { block_type: 'broadcast', inputs: { message: 'riddle-solved' } },
            ],
          },
          {
            block_type: 'if_then',
            inputs: {
              condition: {
                op: 'not',
                args: [{ op: 'contains', args: [{ op: 'answer' }, 'piano'] }],
              },
            },
            children: [
              { block_type: 'say', inputs: { text: 'Wrong. Think about music.', seconds: 3 } },
              { block_type: 'play_sound', inputs: { sound: 'error' } },
              { block_type: 'broadcast', inputs: { message: 'approach' } },
            ],
          },
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
