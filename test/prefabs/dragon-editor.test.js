const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const {
  buildPrefabCharacterResponse,
  matchCharacterPrefab,
} = require('../.build/lib/prefabs/characters.js');
const { buildCharacterVisual } = require('../.build/lib/prefabs/characterPayload.js');

test('each whole-word dragon alias resolves to the checked-in model prefab', () => {
  for (const prompt of ['dragon', 'drake', 'wyrm', 'wyvern']) {
    const dragon = matchCharacterPrefab(prompt);
    assert.equal(dragon.name, 'Red Metal Dragon');
    assert.equal(dragon.model_url, '/models/red-metal-dragon.glb');
    assert.equal(dragon.size, 28);
  }
});

test('dragon id beats another prefab that only matches by alias in a compound prompt', () => {
  // knight has 'warrior' as an alias; dragon has 'dragon' as its id. Id > alias.
  assert.equal(matchCharacterPrefab('red dragon warrior')?.id, 'dragon');
});

test('a compound prompt with two id-matches resolves to the earlier catalog entry', () => {
  // Both hero and dragon are model-backed and match by id; picker-grid order wins.
  assert.equal(matchCharacterPrefab('a hero and dragon')?.id, 'hero');
  // Knight (id match) outranks Dragon's 'wyvern' alias (alias-only match).
  assert.equal(matchCharacterPrefab('a knight riding a wyvern')?.id, 'knight');
});

test('dragon aliases still require whole-word matches', () => {
  assert.equal(matchCharacterPrefab('a heroic dragonfly'), null);
});

test('prefab response builder returns the complete dragon API fields', () => {
  assert.equal(typeof buildPrefabCharacterResponse, 'function');
  const response = buildPrefabCharacterResponse(
    'a red dragon',
    matchCharacterPrefab('a red dragon')
  );

  assert.deepEqual(
    {
      model_url: response.model_url,
      size: response.size,
      source: response.source,
    },
    {
      model_url: '/models/red-metal-dragon.glb',
      size: 28,
      source: 'prefab',
    }
  );
});

test('generate-character route delegates prefab responses to the tested builder', () => {
  const route = fs.readFileSync('app/api/ai/generate-character/route.ts', 'utf8');

  assert.match(route, /NextResponse\.json\(buildPrefabCharacterResponse\(prompt, prefab\)\)/);
});

test('model prefab size flows to sprite data and properties', () => {
  const visual = buildCharacterVisual({ id: 'dragon', model_url: '/models/red-metal-dragon.glb', size: 28 });
  assert.equal(visual.spriteData.size, 28);
  assert.equal(visual.properties.size, 28);
});

test('an imported model without a size retains the fallback', () => {
  const visual = buildCharacterVisual({ id: 'import', model_url: '/uploads/model.glb' });
  assert.equal(visual.spriteData.size, 1);
  assert.equal(visual.properties.size, 1);
});
