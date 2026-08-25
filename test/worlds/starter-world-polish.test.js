'use strict';

const assert = require('node:assert/strict');

const { getWorldTemplate } = require('../.build/lib/worlds/templates');
const { validateWorldTemplate } = require('../.build/lib/worlds/templateValidation');

function allBlocks(blocks) {
  return blocks.flatMap((block) => [
    block,
    ...allBlocks(block.children || []),
    ...allBlocks(block.elseChildren || []),
  ]);
}

function objectById(template, id) {
  const object = template.scenes[0].objects.find((candidate) => candidate.id === id);
  assert.ok(object, `${template.title} includes ${id}`);
  return object;
}

function touchBlocks(object, playerName) {
  return allBlocks(object.blocks).filter((block) => (
    block.block_type === 'when_touches' && block.inputs?.target === playerName
  ));
}

function hasSound(object, sound) {
  return allBlocks(object.blocks).some((block) => (
    block.block_type === 'play_sound' && block.inputs?.sound === sound
  ));
}

// This fails if a starter regresses to the old one-pad / one-goal demo. A child
// should get responsive movement, music after pressing Start, a route with
// feedback, and a clearly signposted finish in every starter world.
const starters = [
  {
    id: 'obby',
    title: 'Rainbow Obby',
    playerId: 'obby-runner',
    playerName: 'Runner',
    soundtrackId: 'obby-music',
    bpm: 128,
    finishId: 'obby-finish',
    routePlatforms: 4,
  },
  {
    id: 'racing',
    title: 'Turbo Track',
    playerId: 'racing-car',
    playerName: 'Speedy Car',
    soundtrackId: 'racing-music',
    bpm: 132,
    finishId: 'racing-finish',
    routePlatforms: 4,
  },
  {
    id: 'story',
    title: 'Castle Story',
    playerId: 'story-explorer',
    playerName: 'Explorer',
    soundtrackId: 'story-music',
    bpm: 96,
    finishId: 'story-treasure',
    routePlatforms: 4,
  },
  {
    id: 'pet',
    title: 'Happy Pet Park',
    playerId: 'pet-puppy',
    playerName: 'Puppy',
    soundtrackId: 'pet-music',
    bpm: 112,
    finishId: 'pet-ball',
    routePlatforms: 4,
  },
];

for (const starter of starters) {
  const template = getWorldTemplate(starter.id, 1);
  assert.ok(template, `${starter.id} has an approved template`);
  assert.equal(template.title, starter.title);
  assert.deepEqual(validateWorldTemplate(template), [], `${starter.title} stays a valid materializable world`);

  const scene = template.scenes[0];
  assert.ok(
    scene.objects.filter((object) => object.type === 'platform').length >= starter.routePlatforms,
    `${starter.title} has a visible route, not a single starting pad`,
  );

  const player = objectById(template, starter.playerId);
  assert.equal(player.playerControlled, true, `${starter.title} has a playable character`);
  assert.equal(player.blocks.find((block) => block.id.endsWith('-move-right'))?.inputs?.distance, 500,
    `${starter.title} moves far enough to traverse its route`);
  assert.deepEqual(
    player.blocks.slice(-3).map((block) => ({ block_type: block.block_type, inputs: block.inputs })),
    [
      { block_type: 'on_key_press', inputs: { key: 'SPACE' } },
      { block_type: 'jump', inputs: undefined },
      { block_type: 'play_sound', inputs: { sound: 'jump' } },
    ],
    `${starter.title} lets kids jump with an audible cue`,
  );

  const soundtrack = objectById(template, starter.soundtrackId);
  assert.deepEqual(
    { type: soundtrack.type, properties: soundtrack.properties },
    { type: 'sound', properties: { autoplay_beat: true, beat: 'simple', bpm: starter.bpm } },
    `${starter.title} starts its background music only after the player starts the game`,
  );

  const finish = objectById(template, starter.finishId);
  assert.equal(touchBlocks(finish, starter.playerName).length, 1, `${starter.title} has a touchable finish`);
  assert.equal(hasSound(finish, 'fanfare'), true, `${starter.title} celebrates success once`);
  assert.equal(allBlocks(finish.blocks).some((block) => block.block_type === 'you_win'), true,
    `${starter.title} has a working win condition`);

  for (const object of scene.objects.filter((candidate) => touchBlocks(candidate, starter.playerName).length > 0)) {
    assert.equal(
      object.position[1],
      -0.75,
      `${starter.title}: ${object.name} sits at the player's reachable platform height`,
    );
  }
}

const obby = getWorldTemplate('obby', 1);
const obbyObjects = obby.scenes[0].objects;
assert.equal(
  obbyObjects.filter((object) => object.type === 'obstacle' && touchBlocks(object, 'Runner').length > 0).length >= 2,
  true,
  'Rainbow Obby teaches avoiding multiple bumpers, not merely walking to a star',
);
assert.equal(
  obbyObjects.filter((object) => object.type === 'collectible' && hasSound(object, 'pickup')).length >= 2,
  true,
  'Rainbow Obby gives encouraging collectible feedback along the way',
);

const racing = getWorldTemplate('racing', 1);
assert.equal(
  racing.scenes[0].objects.filter((object) => object.type === 'obstacle' && touchBlocks(object, 'Speedy Car').length > 0).length >= 2,
  true,
  'Turbo Track has avoidable road hazards',
);

const story = getWorldTemplate('story', 1);
const wizard = objectById(story, 'story-friend');
assert.equal(allBlocks(wizard.blocks).some((block) => block.block_type === 'when_clicked'), true, 'Castle Story keeps its clickable guide');
assert.equal(hasSound(wizard, 'magic'), true, 'Castle Story makes the guide interaction feel magical');
assert.equal(
  story.scenes[0].objects.filter((object) => object.type === 'collectible' && hasSound(object, 'pickup')).length >= 2,
  true,
  'Castle Story rewards exploration before the treasure',
);

const pet = getWorldTemplate('pet', 1);
assert.equal(
  pet.scenes[0].objects.filter((object) => object.type === 'collectible' && hasSound(object, 'pickup')).length >= 2,
  true,
  'Happy Pet Park has treats to find before the final fetch',
);
const parkFriend = objectById(pet, 'pet-friend');
assert.equal(allBlocks(parkFriend.blocks).some((block) => block.block_type === 'when_clicked'), true,
  'Happy Pet Park has a friendly clickable park companion');
assert.equal(hasSound(parkFriend, 'bark'), true, 'the park companion responds with a playful sound');

console.log('Starter world polish tests passed');
