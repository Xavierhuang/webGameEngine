'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '../..');
const BUILD_ROOT = path.join(ROOT, 'test/.build');
const originalLoad = Module._load;
const owner = {
  kind: 'guest',
  profileId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
};

function clearBuildModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(BUILD_ROOT)) delete require.cache[key];
  }
}

function withRouteMocks(mocks, load) {
  clearBuildModules();
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    if (request.startsWith('@/')) {
      return originalLoad(path.join(BUILD_ROOT, `${request.slice(2)}.js`), parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return load();
  } finally {
    Module._load = originalLoad;
  }
}

function post(pathname, body) {
  return new Request(`http://localhost${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('both creation endpoints reject a client attempt to set publication fields', async () => {
  const createRoute = withRouteMocks({
    '@/lib/auth/actor': { resolveActor: async () => owner },
    '@/lib/worlds/templateService': {
      createWorldFromTemplate: async () => ({ projectId: 'world-1', revision: 0, templateId: 'platformer', templateVersion: 1 }),
      WorldTemplateCreationError: class WorldTemplateCreationError extends Error {},
    },
  }, () => require(path.join(BUILD_ROOT, 'app/api/worlds/create/route.js')));

  const blankRoute = withRouteMocks({
    '@/lib/auth/actor': { resolveActor: async () => owner },
    '@/lib/mysql/server': {
      query: async () => [],
      withTransaction: async () => { throw new Error('publication input must be rejected before database writes'); },
    },
    '@/lib/safety/moderation': {
      moderateText: async () => ({ safe: true }),
      sanitizeUserInput: (value) => value,
    },
    '@/lib/i18n/server': { getLocale: async () => 'en' },
    '@/lib/i18n/messages': { translate: () => 'Main Scene' },
  }, () => require(path.join(BUILD_ROOT, 'app/api/projects/route.js')));

  for (const field of [
    { visibility: 'public' },
    { is_published: true },
  ]) {
    const worldResponse = await createRoute.POST(post('/api/worlds/create', {
      templateId: 'platformer', templateVersion: 1, title: 'Sky Steps', ...field,
    }));
    assert.equal(worldResponse.status, 422, `world creation must reject ${Object.keys(field)[0]}`);

    const blankResponse = await blankRoute.POST(post('/api/projects', {
      title: 'Private starter', ...field,
    }));
    assert.equal(blankResponse.status, 422, `blank creation must reject ${Object.keys(field)[0]}`);
  }
});

test('public discovery requires a fully released project and anonymous play cannot read a private world', async () => {
  let sql = '';
  const { listPublicProjects } = withRouteMocks({
    '@/lib/mysql/server': {
      query: async (statement) => {
        sql = statement;
        return [];
      },
    },
  }, () => require(path.join(BUILD_ROOT, 'lib/auth/publicProjects.js')));
  await listPublicProjects();
  assert.match(sql, /p\.visibility = 'public'/);
  assert.match(sql, /p\.is_published = TRUE/);
  assert.match(sql, /p\.moderation_status = 'published'/);

  const { decideAccess } = require(path.join(BUILD_ROOT, 'lib/auth/projectAccess.js'));
  const anonymous = { kind: 'anonymous' };
  assert.equal(
    decideAccess({ owner_id: owner.profileId, visibility: 'private', moderation_status: 'draft' }, anonymous).canView,
    false,
    'an anonymous public-play request cannot view a private template world',
  );
});

test('World Builder share UI is a private-draft status with no publication control', () => {
  const source = fs.readFileSync(path.join(ROOT, 'components/editor/ShareDialog.tsx'), 'utf8');
  const editor = fs.readFileSync(path.join(ROOT, 'components/editor/GameEditor.tsx'), 'utf8');
  assert.match(source, /isWorldBuilder/);
  assert.match(source, /Private draft/);
  assert.match(source, /World Builder worlds stay private/);
  assert.match(editor, /isWorldBuilder=\{Boolean\(worldBuilder\)\}/);
});
