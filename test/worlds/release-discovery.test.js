'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(__dirname, '../..');
const BUILD_ROOT = path.join(ROOT, 'test/.build');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.startsWith('@/')) return originalLoad(path.join(BUILD_ROOT, `${request.slice(2)}.js`), parent, isMain);
  return originalLoad(request, parent, isMain);
};
const CardsModule = require(path.join(BUILD_ROOT, 'components/worlds/PublishedWorldCards.js'));
Module._load = originalLoad;
const PublishedWorldCards = CardsModule.default?.default ?? CardsModule.default ?? CardsModule;

/** Exactly the DTO `toPublicWorldRelease` produces — no more, no less. */
const publicRelease = {
  id: '3c598c7c-c4e3-4083-a205-5c7dc5abde2d',
  slug: 'wr_3c598c7cc4e34083a2055c7dc5abde2d',
  title: 'Cloud Castle',
  description: 'Hop across clouds.',
  thumbnailUrl: '/backdrops/blue-sky.svg',
  templateId: 'platformer',
  genre: 'platformer',
  creatorLabel: 'Cloud Builder',
  publishedAt: '2026-08-26T18:20:00.000Z',
  likeCount: 11,
  playCount: 23,
  remixCount: 4,
};

const render = (releases) => renderToStaticMarkup(React.createElement(PublishedWorldCards, { releases }));

test('release cards link to the public world page and offer a play action', () => {
  const markup = render([publicRelease]);
  assert.match(markup, /href="\/worlds\/wr_3c598c7cc4e34083a2055c7dc5abde2d"/);
  assert.match(markup, /Cloud Castle/);
  assert.match(markup, /Cloud Builder/);
  assert.match(markup, /Hop across clouds/);
  assert.match(markup, /Play/);
  assert.match(markup, /Worlds from the community/);
});

test('a card never renders release authority or private project identity', () => {
  // The DTO allowlist is the boundary, so feed the card a row carrying every
  // field that must not escape and prove none of it reaches the markup.
  const markup = render([{
    ...publicRelease,
    status: 'published',
    current_public: true,
    project_id: 'project-secret',
    owner_id: 'owner-secret',
    submission_idempotency_key: 'idem-secret',
    snapshot_sha256: 'hash-secret',
    decision_reason_code: 'administrative_action',
    reviewer_profile_id: 'reviewer-secret',
  }]);
  assert.doesNotMatch(markup, /project-secret|owner-secret|idem-secret|hash-secret|reviewer-secret/);
  assert.doesNotMatch(markup, /published|current_public|administrative_action/i,
    'release status and moderation vocabulary are not public presentation');
});

test('an empty release list renders nothing at all', () => {
  // Explore must not grow an empty "community worlds" heading before the beta
  // has produced its first approved release.
  assert.equal(render([]), '');
});

test('discovery never links a release to its underlying project', () => {
  const markup = render([publicRelease]);
  assert.doesNotMatch(markup, /\/projects\//, 'the only public route to a release is its opaque slug');
  assert.doesNotMatch(markup, /\/play\//, 'the legacy project player is not a release surface');
});

test('the explore page loads releases separately and does not modify the legacy project query', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.join(ROOT, 'app/explore/page.tsx'), 'utf8');
  assert.match(source, /listPublicProjects\(\{ search: rawQuery, sort: sortKey, limit: 48 \}\)/,
    'the legacy public-project query is unchanged');
  assert.match(source, /listPublicWorldReleases\(/);
  assert.match(source, /<PublishedWorldCards releases=\{worldReleases\} \/>/);
  // The two result sets must never be concatenated into one grid.
  assert.doesNotMatch(source, /projects\s*=\s*\[\s*\.\.\.projects[\s\S]{0,40}worldReleases/);
  assert.doesNotMatch(source, /worldReleases[\s\S]{0,40}\.concat\(projects\)/);
});
