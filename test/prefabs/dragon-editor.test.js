const assert = require('node:assert/strict');
const test = require('node:test');
const { matchCharacterPrefab } = require('../.build/lib/prefabs/characters.js');
const { buildCharacterVisual } = require('../.build/lib/prefabs/characterPayload.js');

test('dragon aliases resolve to the checked-in model prefab', () => {
  for (const prompt of ['dragon', 'red dragon', 'wyvern']) {
    const dragon = matchCharacterPrefab(prompt);
    assert.equal(dragon.name, 'Red Metal Dragon');
    assert.equal(dragon.model_url, '/models/red-metal-dragon.glb');
    assert.ok(dragon.size > 1);
  }
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
