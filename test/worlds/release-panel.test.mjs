/**
 * Creator release panel — rendered, not grepped.
 *
 * The plan sketched these as source-string matches. Rendering the real
 * component is strictly stronger: it proves a control is actually reachable in
 * a given release state rather than that its label exists somewhere in the file.
 */

import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

const PanelModule = await import('../.build/components/worlds/WorldReleasePanel.js');
const WorldReleasePanel = PanelModule.default?.default ?? PanelModule.default ?? PanelModule;

function render(releases) {
  return renderToStaticMarkup(React.createElement(WorldReleasePanel, {
    projectId: 'project-1', projectRevision: 7, initialReleases: releases,
  }));
}

const release = (status, extra = {}) => [{
  id: 'release-1', status, sourceRevision: 7, submittedAt: '2026-08-26T00:00:00.000Z',
  publicSlug: null, checks: [], ...extra,
}];

// A brand-new World Builder project offers exactly one action.
const draft = render([]);
assert.match(draft, /Private draft/);
assert.match(draft, /Submit for review/);
assert.doesNotMatch(draft, /Withdraw/, 'nothing to withdraw before anything is submitted');

// Under review: withdrawal is available, resubmission is not.
const pending = render(release('review_pending'));
assert.match(pending, /Withdraw submission/);
assert.doesNotMatch(pending, /Submit for review/, 'a candidate under review cannot be submitted again');

// Published: the creator can pull it back and can visit it.
const published = render(release('published', { publicSlug: 'wr_abc123' }));
assert.match(published, /Withdraw from Explore/);
assert.match(published, /\/worlds\/wr_abc123/);
assert.doesNotMatch(published, /Submit for review/);

// Withdrawn and changes-requested are both resubmittable.
for (const status of ['withdrawn', 'changes_requested', 'rejected', 'superseded', 'taken_down']) {
  const markup = render(release(status));
  assert.match(markup, /Submit for review/, `${status} must offer a fresh submission`);
  assert.doesNotMatch(markup, /Withdraw/, `${status} has nothing left to withdraw`);
}

// Failed checks become child-readable advice, never a raw code.
const failing = render(release('changes_requested', {
  checks: [
    { name: 'playability', status: 'failed', reasonCode: 'player_missing' },
    { name: 'project_budgets', status: 'failed', reasonCode: 'budget_exceeded' },
    { name: 'asset_policy', status: 'failed', reasonCode: 'some_future_code' },
  ],
}));
assert.match(failing, /Add a character for players to control/);
assert.match(failing, /a bit too big/);
assert.match(failing, /Something needs another look/, 'an unknown code falls back to neutral wording');
assert.doesNotMatch(failing, /player_missing|budget_exceeded|some_future_code/, 'raw check codes never reach a child');

// Nothing staff-facing or personal may ever render here. Note this bans
// reviewer *identity* and raw field names, not the word "reviewer" — child
// copy is allowed to say a reviewer will look at their world.
for (const markup of [draft, pending, published, failing]) {
  assert.doesNotMatch(markup, /moderation_notes|parent_email|birth_month|decision_reason|reviewer_profile_id|owner_id|profile_id/i);
  assert.doesNotMatch(markup, /content_policy|age_safety|administrative_action/i,
    'moderator policy codes are staff vocabulary and never reach the creator');
}

console.log('World release panel tests passed');

// --- ShareDialog integration -------------------------------------------------
// The plan requires the ordinary-project branch to keep its existing behavior.
// Assert both directions: a World Builder project gets the release panel and
// none of the legacy visibility controls, and an ordinary project gets the
// legacy controls and none of the release panel.
// ShareDialog reaches the i18n modules through `@/` specifiers that survive
// compilation, so resolve them for real before loading it.
const { createRequire } = await import('node:module');
const nodePath = await import('node:path');
const requireFromHere = createRequire(import.meta.url);
const NodeModule = requireFromHere('node:module');
const BUILD = nodePath.resolve(import.meta.dirname, '../.build');
const originalLoad = NodeModule._load;
NodeModule._load = function patchedLoad(request, parent, isMain) {
  if (request.startsWith('@/')) return originalLoad(nodePath.join(BUILD, `${request.slice(2)}.js`), parent, isMain);
  return originalLoad(request, parent, isMain);
};
const ShareDialogModule = requireFromHere(nodePath.join(BUILD, 'components/editor/ShareDialog.js'));
NodeModule._load = originalLoad;
const ShareDialog = ShareDialogModule.ShareDialog ?? ShareDialogModule.default?.ShareDialog;

const shareMarkup = (isWorldBuilder, visibility = 'private') => renderToStaticMarkup(
  React.createElement(ShareDialog, {
    projectId: 'project-1', initialVisibility: visibility, initialModerationStatus: 'approved',
    isWorldBuilder, projectRevision: 7, onClose: () => {},
  }),
);

const worldShare = shareMarkup(true);
assert.match(worldShare, /Submit for review/, 'a World Builder project releases through review');
assert.doesNotMatch(worldShare, /Make it public|Make it private/i, 'the legacy visibility toggle is not offered');

for (const visibility of ['private', 'public']) {
  const legacy = shareMarkup(false, visibility);
  assert.doesNotMatch(legacy, /Submit for review|Withdraw from Explore/,
    'an ordinary project never sees release controls');
  assert.match(legacy, /export/i, 'export stays available to ordinary projects');
}
// Export is available to both project types.
assert.match(worldShare, /export/i, 'export stays available to World Builder projects');

console.log('ShareDialog world/legacy branch tests passed');
