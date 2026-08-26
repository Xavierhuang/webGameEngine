const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AiUpdateTranslationError,
  translateAiUpdate,
} = require('../.build/lib/ai/updateTranslation');

const SCENE_A = '11111111-1111-4111-8111-111111111111';
const HERO = '22222222-2222-4222-8222-222222222222';
const NEW_OBJECT = '33333333-3333-4333-8333-333333333333';
const NEW_BLOCK = '44444444-4444-4444-8444-444444444444';

function projectGraph() {
  return {
    scenes: [
      {
        id: SCENE_A,
        name: 'Main scene',
        game_objects: [
          {
            id: HERO,
            name: 'Hero',
            logic_blocks: [
              {
                id: '55555555-5555-4555-8555-555555555555',
                block_type: 'on_start',
                category: 'events',
                order_index: 0,
                block_data: { block_type: 'on_start' },
              },
            ],
          },
        ],
      },
    ],
  };
}

test('translates an AI add_game_object update into one guarded object.create command', () => {
  const commands = translateAiUpdate(
    {
      type: 'add_game_object',
      game_object: {
        type: 'collectible',
        name: 'Moon Gem',
        position: { x: 4, y: 2, z: -3 },
        color: '#FBBF24',
        shape: 'sphere',
        size: 40,
      },
    },
    projectGraph(),
    { newId: () => NEW_OBJECT },
  );

  assert.deepEqual(commands, [
    {
      type: 'object.create',
      objectId: NEW_OBJECT,
      sceneId: SCENE_A,
      name: 'Moon Gem',
      objectType: 'collectible',
      properties: {
        position: { x: 4, y: 2, z: -3 },
        color: '#FBBF24',
        shape: 'sphere',
        size: 40,
      },
    },
  ]);
});

test('translates AI control blocks by retaining the target object’s existing workspace', () => {
  const commands = translateAiUpdate(
    {
      type: 'add_logic_blocks',
      target_object: 'Hero',
      logic_blocks: [
        {
          block_type: 'on_key_press',
          category: 'input',
          inputs: { key: 'ArrowRight', action: 'move_right' },
        },
      ],
    },
    projectGraph(),
    { newId: () => NEW_BLOCK },
  );

  assert.deepEqual(commands, [
    {
      type: 'object.blocks.replace',
      objectId: HERO,
      workspaceJson: {
        blocks: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            block_type: 'on_start',
            category: 'events',
            order_index: 0,
          },
          {
            id: NEW_BLOCK,
            block_type: 'on_key_press',
            category: 'input',
            inputs: { key: 'ArrowRight', action: 'move_right' },
          },
        ],
      },
    },
  ]);
});

test('rejects an AI object request for a scene outside the current project', () => {
  assert.throws(
    () => translateAiUpdate(
      {
        type: 'add_game_object',
        scene_id: '66666666-6666-4666-8666-666666666666',
        game_object: { type: 'sprite', name: 'Not here' },
      },
      projectGraph(),
    ),
    (error) => error instanceof AiUpdateTranslationError && error.code === 'scene_not_found',
  );
});

test('rejects an ambiguous AI object target instead of changing the first matching name', () => {
  const graph = projectGraph();
  graph.scenes[0].game_objects.push({ id: NEW_OBJECT, name: 'Hero', logic_blocks: [] });

  assert.throws(
    () => translateAiUpdate(
      {
        type: 'add_logic_blocks',
        target_object: 'Hero',
        logic_blocks: [{ block_type: 'jump' }],
      },
      graph,
    ),
    (error) => error instanceof AiUpdateTranslationError && error.code === 'ambiguous_target',
  );
});
