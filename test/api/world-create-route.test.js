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

function loadRoutes({ resolvedActor = actor(), createResult, createError, onCreate, isTemplateActive } = {}) {
  const servicePath = path.join(BUILD_ROOT, 'lib/worlds/templateService.js');
  const actorPath = path.join(BUILD_ROOT, 'lib/auth/actor.js');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(BUILD_ROOT) || key === servicePath || key === actorPath) delete require.cache[key];
  }
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@/lib/auth/actor') return { resolveActor: async () => resolvedActor };
    if (request === '@/lib/worlds/templateService') {
      return {
        listWorldTemplateDtos: () => [{
          id: 'platformer', version: 1, title: 'Sky Steps', description: 'A safe starter.', genre: 'Platformer',
          cardArt: '/backdrops/blue-sky.svg', budgets: {}, missions: [],
        }],
        isWorldTemplateActive: isTemplateActive ?? ((templateId, templateVersion) => templateId === 'platformer' && templateVersion === 2),
        createWorldFromTemplate: async (input) => {
          onCreate?.(input);
          if (createError) throw createError;
          return createResult ?? { projectId: 'project-1', revision: 0, templateId: input.templateId, templateVersion: input.templateVersion };
        },
        WorldTemplateCreationError: class WorldTemplateCreationError extends Error {
          constructor(message, status) { super(message); this.status = status; }
        },
      };
    }
    if (request.startsWith('@/')) {
      const target = path.join(BUILD_ROOT, `${request.slice(2)}.js`);
      return originalLoad(target, parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return {
      templateRoute: require(path.join(BUILD_ROOT, 'app/api/world-templates/route.js')),
      createRoute: require(path.join(BUILD_ROOT, 'app/api/worlds/create/route.js')),
    };
  } finally {
    Module._load = originalLoad;
  }
}

function request(body) {
  return new Request('http://localhost/api/worlds/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('anonymous requests are rejected by both world routes', async () => {
  const { templateRoute, createRoute } = loadRoutes({ resolvedActor: actor('anonymous') });
  const templates = await templateRoute.GET(new Request('http://localhost/api/world-templates'));
  const created = await createRoute.POST(request({ templateId: 'platformer', templateVersion: 1, title: 'Sky Steps' }));
  assert.equal(templates.status, 401);
  assert.equal(created.status, 401);
});

test('world template endpoint returns only the allowlisted catalog DTO', async () => {
  const { templateRoute } = loadRoutes();
  const response = await templateRoute.GET(new Request('http://localhost/api/world-templates'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.templates) && body.templates.length > 0);
  for (const template of body.templates) {
    assert.deepEqual(Object.keys(template).sort(), ['budgets', 'cardArt', 'description', 'genre', 'id', 'missions', 'title', 'version']);
    assert.match(template.cardArt, /^\/backdrops\//, 'card art stays in the approved local catalog');
    assert.equal(JSON.stringify(template).includes('modelUrl'), false, 'DTO must not expose object asset URLs');
  }
});

test('create endpoint rejects every client-supplied graph or configuration field', async () => {
  let received;
  const { createRoute } = loadRoutes({
    createResult: { projectId: 'new-project', revision: 0, templateId: 'platformer', templateVersion: 1 },
    onCreate: (input) => { received = input; },
  });
  for (const extra of [
    { objects: [{ modelUrl: 'https://untrusted.example/evil.glb' }] },
    { blocks: [{ block_type: 'delete_everything' }] },
    { modelUrl: 'https://untrusted.example/evil.glb' },
    { config: { allowRemoteAssets: true } },
  ]) {
    const response = await createRoute.POST(request({
      templateId: 'platformer', templateVersion: 1, title: 'Sky Steps', ...extra,
    }));
    assert.equal(response.status, 422, `must reject ${Object.keys(extra)[0]}`);
  }
  assert.equal(received, undefined, 'untrusted graph input must not reach the service');
});

test('invalid client template input is rejected with 422 before world creation', async () => {
  const { createRoute } = loadRoutes();
  const response = await createRoute.POST(request({ templateId: 'platformer', templateVersion: 0, title: '<script>bad</script>' }));
  assert.equal(response.status, 422);
});

test('ordinary creation rejects an inactive catalog version before it reaches the materializer', async () => {
  let received;
  const { createRoute } = loadRoutes({
    onCreate: (input) => { received = input; },
    isTemplateActive: () => false,
  });

  const response = await createRoute.POST(request({ templateId: 'platformer', templateVersion: 1, title: 'Old Sky Steps' }));
  assert.equal(response.status, 422);
  assert.equal(received, undefined, 'only private compatibility callers may materialize inactive versions');
});

test('ordinary creation forwards the active picker version to the materializer', async () => {
  let received;
  const { createRoute } = loadRoutes({
    onCreate: (input) => { received = input; },
    isTemplateActive: (templateId, templateVersion) => templateId === 'platformer' && templateVersion === 2,
    createResult: { projectId: 'sky-project', revision: 0, templateId: 'platformer', templateVersion: 2 },
  });

  const response = await createRoute.POST(request({ templateId: 'platformer', templateVersion: 2, title: 'New Sky Steps' }));
  assert.equal(response.status, 201);
  assert.deepEqual(received, {
    actor: actor(), templateId: 'platformer', templateVersion: 2, title: 'New Sky Steps', description: undefined,
  });
});

test('route source has no client-controlled graph or remote asset input path', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app/api/worlds/create/route.ts'), 'utf8');
  assert.match(source, /resolveActor\(request\)/);
  assert.match(source, /createWorldFromTemplate/);
  assert.doesNotMatch(source, /body\.(?:objects|blocks|modelUrl|configuration)/);
});
