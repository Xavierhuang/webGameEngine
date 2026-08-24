import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

const DraftStatusModule = await import('../.build/components/worlds/WorldDraftStatus.js');
const MissionPanelModule = await import('../.build/components/worlds/WorldMissionPanel.js');
const WorldDraftStatus = DraftStatusModule.default?.default ?? DraftStatusModule.default ?? DraftStatusModule;
const WorldMissionPanel = MissionPanelModule.default?.default ?? MissionPanelModule.default ?? MissionPanelModule;

const status = renderToStaticMarkup(React.createElement(WorldDraftStatus, {
  templateTitle: 'Platformer', revision: 12,
}));
assert.match(status, /Private draft · Platformer · Revision 12/);
assert.doesNotMatch(status, /publish/i, 'draft status never offers a publish control');

const missions = renderToStaticMarkup(React.createElement(WorldMissionPanel, {
  projectId: 'project-1',
  initialMissions: [
    { id: 'make', title: 'Make it yours', description: 'Choose a hero.', kind: 'object_present', status: 'completed' },
    { id: 'play', title: 'Play your world', description: 'Try it.', kind: 'play_started', status: 'not_started' },
  ],
}));
assert.match(missions, /Build missions/);
assert.match(missions, /Make it yours/);
assert.match(missions, /Play your world/);
assert.match(missions, /Completed/);
assert.match(missions, /Dismiss/);

console.log('World mission UI tests passed');
