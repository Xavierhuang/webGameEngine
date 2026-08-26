/** Moderator review queue — rendered against the real component. */

import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

const QueueModule = await import('../.build/components/admin/WorldReleaseQueue.js');
const WorldReleaseQueue = QueueModule.default?.default ?? QueueModule.default ?? QueueModule;

const render = (releases) => renderToStaticMarkup(React.createElement(WorldReleaseQueue, { releases }));

const queued = (status, extra = {}) => ({
  id: 'release-1', creatorLabel: 'Cloud Builder', submittedAt: '2026-08-26T00:00:00.000Z',
  templateId: 'platformer', templateVersion: 2, sourceRevision: 7, publicSlug: null, status,
  checks: [{ name: 'playability', status: 'passed', reasonCode: null }], ...extra,
});

const empty = render([]);
assert.match(empty, /No world releases are waiting for review/);

// A candidate under review gets all three decisions and no takedown.
const pending = render([queued('review_pending')]);
assert.match(pending, /Publish/);
assert.match(pending, /Request changes/);
assert.match(pending, /Reject/);
assert.doesNotMatch(pending, /Choose a reason/, 'an unpublished candidate cannot be taken down');
assert.match(pending, /Cloud Builder/);
assert.match(pending, /platformer v2 · revision 7/);
assert.match(pending, /playability: passed/);

// A published release gets takedown with an explicit allowlisted reason, and
// no further decisions — publishing twice is not a moderator action.
const published = render([queued('published', { publicSlug: 'wr_abc123' })]);
assert.match(published, /Take down/);
assert.match(published, /Choose a reason/);
for (const reason of ['Content policy', 'Age safety', 'Copyright', 'Administrative action']) {
  assert.match(published, new RegExp(reason), `takedown offers ${reason}`);
}
assert.doesNotMatch(published, />Publish</, 'a published release is not publishable again');
assert.match(published, /Open frozen preview/);
assert.match(published, /\/worlds\/wr_abc123/);

// The queue never renders reporter identity, creator accounts, or consent data.
for (const markup of [pending, published]) {
  assert.doesNotMatch(markup, /parent_email|birth_month|profile_id|reporter|moderation_notes|owner_id/i);
}

console.log('World release queue tests passed');
