'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');
const originalLoad = Module._load;

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const safeRow = {
  id: '3c598c7c-c4e3-4083-a205-5c7dc5abde2d',
  slug: 'wr_3c598c7cc4e34083a2055c7dc5abde2d',
  title: 'Cloud Castle',
  description: 'Hop across clouds.',
  thumbnail_url: '/assets/cloud-castle.png',
  template_id: 'sky-steps',
  genre: 'platformer',
  creator_label: 'Cloud Builder',
  published_at: '2026-08-26T18:20:00.000Z',
  like_count: 11,
  play_count: 23,
  remix_count: 4,
  status: 'published',
  current_public: true,
  project_id: 'project-secret',
  owner_id: 'owner-secret',
  profile_id: 'profile-secret',
  parent_email: 'parent@example.test',
  parental_approval: true,
  snapshot_sha256: 'hash-secret',
  reviewer_profile_id: 'reviewer-secret',
  decision_reason_code: 'administrative_action',
  review_notes: 'private note',
};

function clearReleaseModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(ROOT, 'lib/worlds/release'))) delete require.cache[key];
  }
}

function withDatabase(database, load) {
  clearReleaseModules();
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@/lib/mysql/server') return database;
    return originalLoad(request, parent, isMain);
  };
  try {
    return load();
  } finally {
    Module._load = originalLoad;
  }
}

test('public release DTO uses an explicit allowlist and redacts authority data', () => {
  const { toPublicWorldRelease } = withDatabase({
    query: async () => [],
    queryOne: async () => null,
  }, () => require('../../lib/worlds/releaseAccess.ts'));
  const dto = toPublicWorldRelease(safeRow);

  assert.deepEqual(Object.keys(dto).sort(), [
    'creatorLabel', 'description', 'genre', 'id', 'likeCount', 'playCount',
    'publishedAt', 'remixCount', 'slug', 'templateId', 'thumbnailUrl', 'title',
  ]);
  assert.deepEqual(dto, {
    id: safeRow.id,
    slug: safeRow.slug,
    title: safeRow.title,
    description: safeRow.description,
    thumbnailUrl: safeRow.thumbnail_url,
    templateId: safeRow.template_id,
    genre: safeRow.genre,
    creatorLabel: safeRow.creator_label,
    publishedAt: safeRow.published_at,
    likeCount: safeRow.like_count,
    playCount: safeRow.play_count,
    remixCount: safeRow.remix_count,
  });
});

test('public lookups query and return only published current releases', async () => {
  const calls = [];
  const { getPublicWorldReleaseBySlug } = withDatabase({
    query: async () => [],
    queryOne: async (sql, values) => {
      calls.push({ sql, values });
      return safeRow;
    },
  }, () => require('../../lib/worlds/releaseAccess.ts'));

  const result = await getPublicWorldReleaseBySlug(safeRow.slug);

  assert.deepEqual(result, {
    id: safeRow.id,
    slug: safeRow.slug,
    title: safeRow.title,
    description: safeRow.description,
    thumbnailUrl: safeRow.thumbnail_url,
    templateId: safeRow.template_id,
    genre: safeRow.genre,
    creatorLabel: safeRow.creator_label,
    publishedAt: safeRow.published_at,
    likeCount: safeRow.like_count,
    playCount: safeRow.play_count,
    remixCount: safeRow.remix_count,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM world_releases wr/i);
  assert.match(calls[0].sql, /wr\.status = 'published'/i);
  assert.match(calls[0].sql, /wr\.current_public = TRUE/i);
  assert.match(calls[0].sql, /wr\.public_slug = \?/i);
  assert.match(calls[0].sql, /JOIN projects p ON p\.id = wr\.project_id/i);
  assert.doesNotMatch(calls[0].sql, /profiles|owner_id|parental_approval|snapshot_sha256|reviewer|decision_reason|review_notes/i);
  assert.deepEqual(calls[0].values, [safeRow.slug]);
});

test('public lookup rejects a non-current or non-published row even if a database mock returns one', async () => {
  for (const row of [
    { ...safeRow, status: 'superseded', current_public: true },
    { ...safeRow, status: 'published', current_public: false },
  ]) {
    const { getPublicWorldReleaseBySlug } = withDatabase({
      query: async () => [],
      queryOne: async () => row,
    }, () => require('../../lib/worlds/releaseAccess.ts'));
    assert.equal(await getPublicWorldReleaseBySlug(row.slug), null);
  }
});

test('public listing enforces public SQL predicates, normalizes page bounds, and redacts every row', async () => {
  const calls = [];
  const { listPublicWorldReleases } = withDatabase({
    queryOne: async () => null,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return [safeRow, { ...safeRow, id: 'hidden', status: 'withdrawn', current_public: false }];
    },
  }, () => require('../../lib/worlds/releaseAccess.ts'));

  const releases = await listPublicWorldReleases({ page: 0, pageSize: 500 });

  assert.equal(releases.length, 1);
  assert.deepEqual(Object.keys(releases[0]).sort(), [
    'creatorLabel', 'description', 'genre', 'id', 'likeCount', 'playCount',
    'publishedAt', 'remixCount', 'slug', 'templateId', 'thumbnailUrl', 'title',
  ]);
  assert.match(calls[0].sql, /wr\.status = 'published'/i);
  assert.match(calls[0].sql, /wr\.current_public = TRUE/i);
  assert.match(calls[0].sql, /ORDER BY wr\.published_at DESC/i);
  assert.match(calls[0].sql, /LIMIT \? OFFSET \?/i);
  assert.deepEqual(calls[0].values, [60, 0]);
});
