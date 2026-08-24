'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  WORLD_TEMPLATES,
  getWorldTemplate,
} = require('../.build/lib/worlds/templates');
const { validateWorldTemplate } = require('../.build/lib/worlds/templateValidation');
const { BLOCK_SPECS } = require('../.build/lib/blockly/definitions');

const REQUIRED_TEMPLATE_IDS = ['platformer', 'obby', 'racing', 'story', 'pet'];

function test(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

function flattenObjects(template) {
  return template.scenes.flatMap((scene) => scene.objects);
}

function walkBlocks(blocks, visitor) {
  for (const block of blocks) {
    visitor(block);
    walkBlocks(block.children || [], visitor);
    walkBlocks(block.elseChildren || [], visitor);
  }
}

function assetReferences(template) {
  const refs = [template.cardArt];
  for (const scene of template.scenes) {
    refs.push(scene.backgroundImageUrl);
    for (const object of scene.objects) {
      if (object.modelUrl) refs.push(object.modelUrl);
    }
  }
  return refs.filter(Boolean);
}

function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}

function issueCodes(template) {
  return validateWorldTemplate(template).map((issue) => issue.code);
}

test('catalog contains exactly the five approved template families', () => {
  assert.deepStrictEqual(
    WORLD_TEMPLATES.map((template) => template.id).sort(),
    [...REQUIRED_TEMPLATE_IDS].sort(),
  );
});

test('every catalog template is playable, local, and palette-supported', () => {
  for (const template of WORLD_TEMPLATES) {
    assert.ok(Number.isInteger(template.version) && template.version > 0, `${template.id}: valid version`);
    assert.ok(template.title, `${template.id}: title`);
    assert.ok(template.description, `${template.id}: description`);
    assert.ok(template.genre, `${template.id}: genre`);
    assert.ok(template.cardArt, `${template.id}: card art`);
    assert.ok(template.scenes.length >= 1, `${template.id}: has a scene`);
    assert.ok(template.missions.length >= 1, `${template.id}: has a mission`);

    const objects = flattenObjects(template);
    assert.ok(objects.length >= 1, `${template.id}: has an object`);
    assert.ok(
      objects.some((object) => object.type === 'character' || object.playerControlled),
      `${template.id}: has a player-controlled character`,
    );

    assert.strictEqual(new Set(template.scenes.map((scene) => scene.id)).size, template.scenes.length, `${template.id}: scene ids are unique`);
    assert.strictEqual(new Set(objects.map((object) => object.id)).size, objects.length, `${template.id}: object ids are unique`);
    assert.strictEqual(new Set(template.missions.map((mission) => mission.id)).size, template.missions.length, `${template.id}: mission ids are unique`);

    walkBlocks(objects.flatMap((object) => object.blocks), (block) => {
      assert.ok(BLOCK_SPECS[block.block_type], `${template.id}: ${block.block_type} exists in BLOCK_SPECS`);
    });
    for (const asset of assetReferences(template)) {
      assert.ok(asset.startsWith('/models/') || asset.startsWith('/backdrops/'), `${template.id}: local asset ${asset}`);
      assert.ok(
        fs.existsSync(path.resolve(__dirname, '../..', 'public', asset.slice(1))),
        `${template.id}: packaged asset ${asset} exists`,
      );
    }
    assert.deepStrictEqual(validateWorldTemplate(template), [], `${template.id}: validates`);
  }
});

test('object-targeting starter blocks use names the runtime can resolve', () => {
  for (const template of WORLD_TEMPLATES) {
    const names = new Set(flattenObjects(template).map((object) => object.name));
    for (const object of flattenObjects(template)) {
      walkBlocks(object.blocks, (block) => {
        if (typeof block.inputs?.target === 'string' && block.inputs.target) {
          assert.ok(names.has(block.inputs.target), `${template.id}: ${block.block_type} targets ${block.inputs.target}`);
        }
      });
    }
  }
});

test('template lookup returns an immutable independent copy', () => {
  const first = getWorldTemplate('platformer', 1);
  assert.ok(first, 'known template is returned');
  assert.ok(Object.isFrozen(first), 'template copy is frozen');
  assert.ok(Object.isFrozen(first.scenes), 'nested scene list is frozen');
  assert.throws(() => first.scenes.push({}), TypeError, 'copy cannot be mutated');
  assert.strictEqual(getWorldTemplate('not-a-template', 1), null, 'unknown template is absent');
  assert.strictEqual(getWorldTemplate('platformer', 2), null, 'unknown version is absent');
});

test('validation rejects duplicate ids anywhere in the graph', () => {
  const fixture = cloneTemplate(getWorldTemplate('platformer', 1));
  fixture.scenes[0].objects.push({
    ...fixture.scenes[0].objects[0],
    name: 'Duplicate hero',
  });
  assert.ok(issueCodes(fixture).includes('duplicate_id'));
});

test('validation rejects remote model URLs', () => {
  const fixture = cloneTemplate(getWorldTemplate('platformer', 1));
  fixture.scenes[0].objects[0].modelUrl = 'https://example.com/character.glb';
  assert.ok(issueCodes(fixture).includes('unsafe_asset_path'));
});

test('validation recursively rejects unknown block types', () => {
  const fixture = cloneTemplate(getWorldTemplate('platformer', 1));
  fixture.scenes[0].objects[0].blocks[0].children = [{
    id: 'unknown-nested-block',
    block_type: 'teleport_to_the_moon',
  }];
  assert.ok(issueCodes(fixture).includes('unsupported_block_type'));
});

test('validation rejects prototype-named block types', () => {
  const fixture = cloneTemplate(getWorldTemplate('platformer', 1));
  fixture.scenes[0].objects[0].blocks[0].block_type = 'constructor';
  assert.ok(issueCodes(fixture).includes('unsupported_block_type'));
});

test('validation rejects missions that cannot be completed', () => {
  const fixture = cloneTemplate(getWorldTemplate('platformer', 1));
  fixture.missions[0].objectId = 'missing-object';
  fixture.missions[1].blockType = 'constructor';
  assert.ok(issueCodes(fixture).includes('invalid_mission'));
});

test('validation rejects a template without scenes', () => {
  const fixture = cloneTemplate(getWorldTemplate('platformer', 1));
  fixture.scenes = [];
  assert.ok(issueCodes(fixture).includes('empty_scenes'));
});

test('validation rejects a template that exceeds its object budget', () => {
  const fixture = cloneTemplate(getWorldTemplate('platformer', 1));
  const limit = fixture.budgets.maxObjects;
  fixture.scenes[0].objects = Array.from({ length: limit + 1 }, (_, index) => ({
    id: `budget-object-${index}`,
    name: `Budget object ${index}`,
    type: index === 0 ? 'character' : 'platform',
    playerControlled: index === 0,
    position: [index, 0, 0],
    blocks: [],
  }));
  assert.ok(issueCodes(fixture).includes('budget_exceeded'));
});

test('validation rejects a template that exceeds its scene budget', () => {
  const fixture = cloneTemplate(getWorldTemplate('platformer', 1));
  fixture.scenes = Array.from({ length: fixture.budgets.maxScenes + 1 }, (_, index) => ({
    ...fixture.scenes[0],
    id: `budget-scene-${index}`,
    objects: [],
  }));
  assert.ok(issueCodes(fixture).includes('budget_exceeded'));
});

test('validation rejects incomplete top-level catalog data and malformed graph arrays', () => {
  const fixtures = [
    ['non-positive version', (template) => { template.version = 0; }, 'invalid_version'],
    ['blank title', (template) => { template.title = '   '; }, 'invalid_metadata'],
    ['non-array scenes', (template) => { template.scenes = {}; }, 'invalid_structure'],
    ['non-array object list', (template) => { template.scenes[0].objects = null; }, 'invalid_structure'],
    ['missing block list', (template) => { delete template.scenes[0].objects[0].blocks; }, 'invalid_structure'],
    ['unknown object type', (template) => { template.scenes[0].objects[0].type = 'spaceship'; }, 'invalid_object_type'],
  ];

  for (const [name, mutate, code] of fixtures) {
    const fixture = cloneTemplate(getWorldTemplate('platformer', 1));
    mutate(fixture);
    assert.ok(issueCodes(fixture).includes(code), name);
  }
});

test('validation requires three to five readable missions', () => {
  const noMissions = cloneTemplate(getWorldTemplate('platformer', 1));
  noMissions.missions = [];
  assert.ok(issueCodes(noMissions).includes('invalid_mission'), 'empty mission list');

  const tooManyMissions = cloneTemplate(getWorldTemplate('platformer', 1));
  tooManyMissions.missions.push(
    { ...tooManyMissions.missions[0], id: 'fourth-mission' },
    { ...tooManyMissions.missions[0], id: 'fifth-mission' },
    { ...tooManyMissions.missions[0], id: 'sixth-mission' },
  );
  assert.ok(issueCodes(tooManyMissions).includes('invalid_mission'), 'six missions');

  const unreadableMission = cloneTemplate(getWorldTemplate('platformer', 1));
  unreadableMission.missions[0].description = '';
  assert.ok(issueCodes(unreadableMission).includes('invalid_mission'), 'blank mission description');

  const unnamedMission = cloneTemplate(getWorldTemplate('platformer', 1));
  unnamedMission.missions[0].id = '';
  assert.ok(issueCodes(unnamedMission).includes('invalid_mission'), 'blank mission id');
});

test('validation requires an actual controllable character', () => {
  const metadataOnly = cloneTemplate(getWorldTemplate('platformer', 1));
  for (const object of flattenObjects(metadataOnly)) {
    object.type = 'platform';
    object.playerControlled = true;
  }
  assert.ok(issueCodes(metadataOnly).includes('missing_player'), 'metadata alone is not a player');

  const unmarkedCharacter = cloneTemplate(getWorldTemplate('platformer', 1));
  unmarkedCharacter.scenes[0].objects[0].playerControlled = false;
  assert.ok(issueCodes(unmarkedCharacter).includes('missing_player'), 'character must be marked player controlled');

  const noControls = cloneTemplate(getWorldTemplate('platformer', 1));
  noControls.scenes[0].objects[0].blocks = [];
  assert.ok(issueCodes(noControls).includes('missing_player'), 'player character needs control blocks');

  const separatedControlBlocks = cloneTemplate(getWorldTemplate('platformer', 1));
  separatedControlBlocks.scenes[0].objects[0].blocks = [
    { id: 'orphan-key', block_type: 'on_key_press', inputs: { key: 'ArrowUp' } },
    { id: 'different-script', block_type: 'on_start' },
    { id: 'unreachable-move', block_type: 'move', inputs: { direction: 'up', distance: 10 } },
  ];
  assert.ok(issueCodes(separatedControlBlocks).includes('missing_player'), 'key and move must be in the same script');
});

if (process.exitCode) {
  console.error('\nWorld template tests failed');
} else {
  console.log('\nWorld template tests passed');
}
