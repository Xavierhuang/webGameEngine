'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  evaluateWorldMission,
  parseWorldMissionAction,
} = require('../.build/lib/worlds/missions.js');

const platformerMissions = [
  { id: 'place-star', kind: 'object_present', objectId: 'star' },
  { id: 'add-jump', kind: 'block_present', blockType: 'jump' },
  { id: 'test-world', kind: 'play_started' },
  { id: 'reach-goal', kind: 'outcome_reached', outcome: 'win' },
];

test('object mission completes only for its exact required object', () => {
  const mission = platformerMissions[0];
  assert.equal(evaluateWorldMission(mission, { type: 'object_present', objectId: 'star' }), true);
  assert.equal(evaluateWorldMission(mission, { type: 'object_present', objectId: 'ground' }), false);
  assert.equal(evaluateWorldMission(mission, { type: 'panel_opened' }), false);
});

test('post-baseline object-type missions accept only the server-verified requested type', () => {
  const mission = { id: 'add-platform', kind: 'object_present', objectType: 'platform' };
  assert.equal(
    evaluateWorldMission(mission, { type: 'object_present', objectId: 'new-platform', verifiedObjectType: 'platform' }),
    true,
  );
  assert.equal(
    evaluateWorldMission(mission, { type: 'object_present', objectId: 'new-star', verifiedObjectType: 'collectible' }),
    false,
  );
  assert.equal(
    evaluateWorldMission(mission, { type: 'object_present', objectId: 'unverified-platform' }),
    false,
  );
});

test('block mission accepts a recursively discovered exact block type only', () => {
  const mission = platformerMissions[1];
  assert.equal(
    evaluateWorldMission(mission, {
      type: 'block_present',
      objectId: 'hero',
      verifiedBlockTypes: ['forever', 'jump'],
    }),
    true,
  );
  assert.equal(
    evaluateWorldMission(mission, {
      type: 'block_present',
      objectId: 'hero',
      verifiedBlockTypes: ['forever', 'move'],
    }),
    false,
  );
});

test('play mission is bound to the current project session', () => {
  const mission = platformerMissions[2];
  assert.equal(
    evaluateWorldMission(mission, { type: 'play_started', projectId: 'project-a', sessionProjectId: 'project-a' }),
    true,
  );
  assert.equal(
    evaluateWorldMission(mission, { type: 'play_started', projectId: 'project-a', sessionProjectId: 'project-b' }),
    false,
  );
});

test('outcome missions remain deferred until runtime facts can be verified server-side', () => {
  const mission = platformerMissions[3];
  assert.equal(evaluateWorldMission(mission, { type: 'outcome_reached', outcome: 'win' }), false);
  assert.equal(evaluateWorldMission(mission, { type: 'outcome_reached', outcome: 'fun' }), false);
});

test('unknown action payloads and missions from another template never complete', () => {
  assert.equal(parseWorldMissionAction({ type: 'panel_opened' }).success, false);
  assert.equal(
    evaluateWorldMission(
      { id: 'pet-play', kind: 'play_started', templateId: 'pet' },
      { type: 'play_started', projectId: 'project-a', sessionProjectId: 'project-a', templateId: 'platformer' },
    ),
    false,
  );
});
