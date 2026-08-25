'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '../..');
const BUILD_ROOT = path.join(ROOT, 'test/.build');
const originalLoad = Module._load;

function actor(kind = 'guest') {
  return kind === 'anonymous'
    ? { kind: 'anonymous' }
    : { kind: 'guest', profileId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222' };
}

function loadRoute({ resolvedActor = actor(), previewResult = null } = {}) {
  const routePath = path.join(BUILD_ROOT, 'app/api/world-templates/[templateId]/preview/route.js');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(BUILD_ROOT)) delete require.cache[key];
  }

  const previewCalls = [];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@/lib/auth/actor') return { resolveActor: async () => resolvedActor };
    if (request === '@/lib/worlds/templateService') {
      return {
        previewWorldTemplate: (templateId, templateVersion) => {
          previewCalls.push({ templateId, templateVersion });
          return previewResult;
        },
      };
    }
    if (request.startsWith('@/')) return originalLoad(path.join(BUILD_ROOT, `${request.slice(2)}.js`), parent, isMain);
    return originalLoad(request, parent, isMain);
  };
  try {
    return { route: require(routePath), previewCalls };
  } finally {
    Module._load = originalLoad;
  }
}

function request(url) {
  return { nextUrl: new URL(url) };
}

function context(templateId = 'platformer') {
  return { params: Promise.resolve({ templateId }) };
}

test('anonymous preview requests are rejected before the template service', async () => {
  const { route, previewCalls } = loadRoute({ resolvedActor: actor('anonymous') });
  const response = await route.GET(request('http://localhost/api/world-templates/platformer/preview?version=2'), context());

  assert.equal(response.status, 401);
  assert.deepEqual(previewCalls, [], 'anonymous callers must not reach the preview service');
});

test('preview route rejects missing, malformed, and non-positive versions before the template service', async () => {
  for (const version of ['', 'two', '0', '-1', '1.5']) {
    const { route, previewCalls } = loadRoute({ previewResult: { id: 'should-not-return' } });
    const suffix = version ? `?version=${version}` : '';
    const response = await route.GET(request(`http://localhost/api/world-templates/platformer/preview${suffix}`), context());

    assert.equal(response.status, 422, `version ${JSON.stringify(version)} is rejected`);
    assert.deepEqual(previewCalls, [], 'invalid input must not reach the preview service');
  }
});

test('preview route returns only the transient server-produced project for an authenticated caller', async () => {
  const preview = { id: 'template-preview-platformer-2', owner_id: 'template-preview', scenes: [] };
  const { route, previewCalls } = loadRoute({ previewResult: preview });
  const response = await route.GET(request('http://localhost/api/world-templates/platformer/preview?version=2'), context());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { preview });
  assert.deepEqual(previewCalls, [{ templateId: 'platformer', templateVersion: 2 }]);
});

test('preview route returns not found when the server catalog does not offer that version', async () => {
  const { route, previewCalls } = loadRoute({ previewResult: null });
  const response = await route.GET(request('http://localhost/api/world-templates/unknown/preview?version=2'), context('unknown'));

  assert.equal(response.status, 404);
  assert.deepEqual(previewCalls, [{ templateId: 'unknown', templateVersion: 2 }]);
});

test('Sky Steps previews retain their background-music settings', () => {
  const { getWorldTemplate } = require(path.join(BUILD_ROOT, 'lib/worlds/templates.js'));
  const { previewProjectFromTemplate } = require(path.join(BUILD_ROOT, 'lib/worlds/previewProject.js'));
  const template = getWorldTemplate('platformer', 2);
  const preview = previewProjectFromTemplate(template);
  const soundtrack = preview.scenes[0].game_objects.find((object) => object.id === 'sky-music');

  assert.deepEqual(
    soundtrack && { type: soundtrack.type, properties: soundtrack.properties },
    {
      type: 'sound',
      properties: {
        shape: 'box', model_url: undefined, playerControlled: false,
        autoplay_beat: true, beat: 'chill', bpm: 90,
      },
    },
    'the playable preview gets the exact soundtrack the starter world declares',
  );
});

test('preview route source remains read-only and server-owned', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app/api/world-templates/[templateId]/preview/route.ts'), 'utf8');
  assert.match(source, /resolveActor\(request\)/);
  assert.match(source, /previewWorldTemplate\(templateId, version\)/);
  assert.doesNotMatch(source, /createWorldFromTemplate|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM/);
});
