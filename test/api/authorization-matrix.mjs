import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertLocalBaseUrl } from '../helpers/local-base-url.mjs';

const BASE = assertLocalBaseUrl(process.argv[2] || 'http://localhost:3100');
const stamp = `${Date.now().toString(36)}-${process.pid}`;

/**
 * The active platformer template, resolved rather than hardcoded.
 *
 * This file pinned `templateVersion: 1` until 2026-08-27. Sky Steps v2 marked
 * that entry `active: false`, so every world-creation call here began returning
 * 422 "Unknown template" and the entire authorization matrix stopped running —
 * undetected, because this suite is reachable from no CI aggregator. Reading
 * the version from the catalog means the next version bump cannot silently
 * disable the matrix again.
 */
const { listActiveWorldTemplates } = await import('../.build/lib/worlds/templates.js');
const activeTemplate = listActiveWorldTemplates().find((t) => t.id === 'platformer');
if (!activeTemplate) throw new Error('no active platformer template to exercise');
const TEMPLATE = { templateId: activeTemplate.id, templateVersion: activeTemplate.version };

class Client {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size) {
      headers.set('Cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    }
    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }
    const response = await fetch(`${BASE}${path}`, { ...options, headers, body, redirect: 'manual' });
    const combined = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie().join('\n')
      : (response.headers.get('set-cookie') ?? '');
    for (const match of combined.matchAll(/(?:^|[,\n]\s*)(auth-token|lingplay_guest_session)=([^;,]*)/g)) {
      if (match[2]) this.cookies.set(match[1], match[2]);
      else this.cookies.delete(match[1]);
    }
    return response;
  }
}

const owner = new Client('owner');
const guest = new Client('guest owner');
const stranger = new Client('stranger');
const anonymous = new Client('anonymous');

async function json(response) {
  return response.json().catch(() => ({}));
}

async function expectStatus(client, label, path, method = 'GET', body, expected = [200]) {
  const response = await client.request(path, { method, body });
  if (!expected.includes(response.status)) {
    const details = JSON.stringify(await json(response));
    assert.fail(
      `${client.label}: ${label} returned ${response.status}, expected ${expected.join('/')}: ${details}`
    );
  }
  console.log(`ok  ${client.label.padEnd(12)} ${method.padEnd(6)} ${label} (${response.status})`);
  return response;
}

async function signUp(client, tag) {
  const response = await client.request('/api/auth/signup', {
    method: 'POST',
    body: {
      email: `${tag}-${stamp}@example.com`,
      password: 'Authorization!2345',
      username: `${tag}${stamp}`.replace(/[^a-z0-9]/gi, '').slice(0, 24),
      // Signup is child-only; use an age that does not require a consent
      // request so this matrix can exercise an authenticated non-owner.
      dateOfBirth: '2010-01-01',
    },
  });
  assert.equal(response.status, 200, `${tag} signup failed: ${JSON.stringify(await json(response))}`);
}

function importPayload(tag, objectCount = 1) {
  const sceneId = `${tag}-source-scene`;
  return {
    format: 'lingplay-project',
    version: 1,
    project: { title: `${tag} ${stamp}`, description: 'authorization matrix', genre: 'test' },
    scenes: [{ id: sceneId, name: 'Main', order_index: 0, background_color: '#87CEEB' }],
    game_objects: Array.from({ length: objectCount }, (_, index) => ({
      id: `${tag}-source-object-${index}`,
      scene_id: sceneId,
      type: 'sprite',
      name: `${tag} object ${index}`,
      position_x: index,
      position_y: 0,
      position_z: 0,
      color: '#6366f1',
    })),
    logic_blocks: [{
      game_object_id: `${tag}-source-object-0`,
      block_type: 'on_start',
      category: 'event',
      order_index: 0,
      block_data: {},
    }],
  };
}

async function importProject(client, tag, objectCount = 1) {
  const response = await expectStatus(
    client,
    `import ${tag}`,
    '/api/projects/import',
    'POST',
    importPayload(tag, objectCount),
    [200]
  );
  return (await json(response)).project.id;
}

async function loadProject(client, projectId) {
  const response = await client.request(`/api/projects/${projectId}`);
  assert.equal(response.status, 200, `${client.label} could not load ${projectId}`);
  return (await json(response)).project;
}

console.log(`\nauthorization matrix against ${BASE}\n`);
await signUp(owner, 'owner');
await signUp(stranger, 'stranger');
await expectStatus(guest, 'issue opaque guest session', '/api/guest-session', 'POST', undefined, [200]);

await expectStatus(anonymous, 'anonymous project creation', '/api/projects', 'POST', {
  title: 'must not exist',
}, [401]);

const ownerProjectId = await importProject(owner, 'owner', 1);
const guestProjectId = await importProject(guest, 'guest', 1);
const strangerProjectId = await importProject(stranger, 'stranger', 2);
const createdOwner = await expectStatus(owner, 'create project', '/api/projects', 'POST', {
  title: `owner create ${stamp}`,
  description: 'created through project collection',
}, [200]);
const createdOwnerId = (await json(createdOwner)).project.id;
const createdGuest = await expectStatus(guest, 'create guest project', '/api/projects', 'POST', {
  title: `guest create ${stamp}`,
}, [200]);
const createdGuestId = (await json(createdGuest)).project.id;

for (const client of [owner, guest, stranger]) {
  await expectStatus(client, 'world template catalog', '/api/world-templates', 'GET', undefined, [200]);
}
await expectStatus(anonymous, 'anonymous world template catalog', '/api/world-templates', 'GET', undefined, [401]);

await expectStatus(owner, 'reject publication fields on blank create', '/api/projects', 'POST', {
  title: `owner blocked publication ${stamp}`,
  visibility: 'public',
}, [422]);
await expectStatus(owner, 'reject publication fields on world create', '/api/worlds/create', 'POST', {
  ...TEMPLATE, title: `owner blocked world ${stamp}`, is_published: true,
}, [422]);

async function createPrivateWorld(client, label) {
  const response = await expectStatus(client, `create ${label} private world`, '/api/worlds/create', 'POST', {
    ...TEMPLATE,
    title: `${label} private world ${stamp}`,
  }, [201]);
  return (await json(response)).projectId;
}

const ownerWorldId = await createPrivateWorld(owner, 'owner');
const guestWorldId = await createPrivateWorld(guest, 'guest');
const strangerWorldId = await createPrivateWorld(stranger, 'stranger');
await expectStatus(anonymous, 'anonymous world creation', '/api/worlds/create', 'POST', {
  ...TEMPLATE, title: `anonymous private world ${stamp}`,
}, [401]);

const ownerWorld = await loadProject(owner, ownerWorldId);
const guestWorld = await loadProject(guest, guestWorldId);
const ownerWorldObjectId = ownerWorld.scenes[0]?.game_objects[0]?.id;
const guestWorldObjectId = guestWorld.scenes[0]?.game_objects[0]?.id;
assert.ok(ownerWorldObjectId && guestWorldObjectId, 'template worlds must materialize editable objects');

for (const [client, id, status] of [
  [owner, ownerWorldId, 200],
  [guest, guestWorldId, 200],
  [stranger, ownerWorldId, 404],
  [anonymous, ownerWorldId, 404],
]) {
  await expectStatus(client, 'private world editor API', `/api/projects/${id}`, 'GET', undefined, [status]);
}

for (const [client, id, objectId, status] of [
  [owner, ownerWorldId, ownerWorldObjectId, 200],
  [guest, guestWorldId, guestWorldObjectId, 200],
  [stranger, ownerWorldId, ownerWorldObjectId, 404],
  [anonymous, ownerWorldId, ownerWorldObjectId, 401],
]) {
  await expectStatus(client, 'private world mission read', `/api/projects/${id}/world-missions`, 'GET', undefined, [status]);
  await expectStatus(client, 'private world mission write', `/api/projects/${id}/world-missions`, 'POST', {
    action: { type: 'object_present', objectId },
  }, [status]);
}

for (const path of [`/editor/${ownerWorldId}`, `/play/${ownerWorldId}`]) {
  await expectStatus(owner, `owner private world ${path}`, path, 'GET', undefined, [200]);
  await expectStatus(stranger, `stranger private world ${path}`, path, 'GET', undefined, [404]);
  await expectStatus(anonymous, `anonymous private world ${path}`, path, 'GET', undefined, [404]);
}
await expectStatus(guest, 'guest private world editor', `/editor/${guestWorldId}`, 'GET', undefined, [200]);
await expectStatus(guest, 'guest private world play', `/play/${guestWorldId}`, 'GET', undefined, [200]);

for (const client of [owner, guest, stranger, anonymous]) {
  await expectStatus(client, 'project collection', '/api/projects', 'GET', undefined, [200]);
}

for (const [client, id, status] of [
  [owner, ownerProjectId, 200],
  [guest, guestProjectId, 200],
  [stranger, ownerProjectId, 404],
  [anonymous, ownerProjectId, 404],
]) {
  await expectStatus(client, 'private project API', `/api/projects/${id}`, 'GET', undefined, [status]);
}

for (const path of [`/projects/${ownerProjectId}`, `/play/${ownerProjectId}`, `/editor/${ownerProjectId}`]) {
  await expectStatus(owner, `owner page ${path}`, path, 'GET', undefined, [200]);
  await expectStatus(stranger, `stranger page ${path}`, path, 'GET', undefined, [404]);
  await expectStatus(anonymous, `anonymous page ${path}`, path, 'GET', undefined, [404]);
}

await expectStatus(owner, 'rename owned project', `/api/projects/${ownerProjectId}`, 'PATCH', {
  title: `owner renamed ${stamp}`,
}, [200]);
await expectStatus(guest, 'rename guest-owned project', `/api/projects/${guestProjectId}`, 'PATCH', {
  title: `guest renamed ${stamp}`,
}, [200]);
await expectStatus(stranger, 'rename someone else project', `/api/projects/${ownerProjectId}`, 'PATCH', {
  title: 'forged stranger title', owner_id: randomUUID(), profileId: randomUUID(), role: 'admin',
}, [404]);
await expectStatus(anonymous, 'anonymous rename', `/api/projects/${ownerProjectId}`, 'PATCH', {
  title: 'forged anonymous title', owner_id: randomUUID(), role: 'admin',
}, [404]);

const ownerGraph = await loadProject(owner, ownerProjectId);
const guestGraph = await loadProject(guest, guestProjectId);
const strangerGraph = await loadProject(stranger, strangerProjectId);
const ownerScene = ownerGraph.scenes[0];
const ownerObject = ownerScene.game_objects[0];
const guestScene = guestGraph.scenes[0];
const guestObject = guestScene.game_objects[0];
const strangerScene = strangerGraph.scenes[0];
const [strangerObject0, strangerObject1] = strangerScene.game_objects;

await expectStatus(owner, 'read owned object', `/api/game-objects/${ownerObject.id}`, 'GET', undefined, [200]);
await expectStatus(guest, 'read guest-owned object', `/api/game-objects/${guestObject.id}`, 'GET', undefined, [200]);
await expectStatus(stranger, 'read another private object', `/api/game-objects/${ownerObject.id}`, 'GET', undefined, [404]);
await expectStatus(anonymous, 'anonymous private object read', `/api/game-objects/${ownerObject.id}`, 'GET', undefined, [404]);

await expectStatus(owner, 'edit owned object', `/api/game-objects/${ownerObject.id}`, 'PATCH', { color: '#123456' }, [200]);
await expectStatus(guest, 'edit guest-owned object', `/api/game-objects/${guestObject.id}`, 'PATCH', { color: '#654321' }, [200]);
await expectStatus(stranger, 'cross-project object edit', `/api/game-objects/${ownerObject.id}`, 'PATCH', {
  color: '#000000', projectId: strangerProjectId, owner_id: randomUUID(),
}, [404]);
await expectStatus(anonymous, 'anonymous object edit', `/api/game-objects/${ownerObject.id}`, 'PATCH', { color: '#000000' }, [404]);

await expectStatus(owner, 'save owned blocks', `/api/game-objects/${ownerObject.id}/logic-blocks`, 'PUT', {
  blocks: [{ block_type: 'on_start' }, { block_type: 'move', inputs: { steps: 4 } }],
}, [200]);
await expectStatus(stranger, 'overwrite another project blocks', `/api/game-objects/${ownerObject.id}/logic-blocks`, 'PUT', {
  blocks: [{ block_type: 'game_over' }], projectId: strangerProjectId,
}, [404]);
await expectStatus(anonymous, 'anonymous block overwrite', `/api/game-objects/${ownerObject.id}/logic-blocks`, 'PUT', {
  blocks: [],
}, [404]);

await expectStatus(stranger, 'establish owned order', '/api/game-objects/reorder', 'POST', {
  sceneId: strangerScene.id,
  orderedIds: [strangerObject1.id, strangerObject0.id],
}, [200]);
const beforeCrossProjectOrder = (await loadProject(stranger, strangerProjectId))
  .scenes[0].game_objects.map((object) => object.id);
await expectStatus(owner, 'cross-project reorder attempt', '/api/game-objects/reorder', 'POST', {
  sceneId: ownerScene.id,
  orderedIds: [strangerObject0.id],
  projectId: ownerProjectId,
}, [404]);
const afterCrossProjectOrder = (await loadProject(stranger, strangerProjectId))
  .scenes[0].game_objects.map((object) => object.id);
assert.deepEqual(
  afterCrossProjectOrder,
  beforeCrossProjectOrder,
  'an object from another project was reordered through an owned scene'
);

await expectStatus(owner, 'create scene', '/api/scenes', 'POST', {
  projectId: ownerProjectId,
  name: 'Second scene',
}, [200]);
await expectStatus(stranger, 'create scene in another project', '/api/scenes', 'POST', {
  projectId: ownerProjectId,
  name: 'Intrusion', owner_id: randomUUID(),
}, [404]);
await expectStatus(anonymous, 'anonymous scene creation', '/api/scenes', 'POST', {
  projectId: ownerProjectId,
  name: 'Intrusion',
}, [404]);
const ownerAfterScene = await loadProject(owner, ownerProjectId);
const secondScene = ownerAfterScene.scenes.find((scene) => scene.id !== ownerScene.id);
assert.ok(secondScene, 'owner scene creation did not persist');
await expectStatus(owner, 'edit owned scene', `/api/scenes/${secondScene.id}`, 'PATCH', { name: 'Renamed scene' }, [200]);
await expectStatus(stranger, 'edit another project scene', `/api/scenes/${secondScene.id}`, 'PATCH', { name: 'Intrusion' }, [404]);
await expectStatus(anonymous, 'anonymous scene edit', `/api/scenes/${secondScene.id}`, 'PATCH', { name: 'Intrusion' }, [404]);
await expectStatus(owner, 'delete owned scene', `/api/scenes/${secondScene.id}`, 'DELETE', undefined, [200]);

await expectStatus(owner, 'export owned project', `/api/projects/${ownerProjectId}/export`, 'GET', undefined, [200]);
await expectStatus(guest, 'export guest-owned project', `/api/projects/${guestProjectId}/export`, 'GET', undefined, [200]);
await expectStatus(stranger, 'export private stranger project', `/api/projects/${ownerProjectId}/export`, 'GET', undefined, [404]);
await expectStatus(anonymous, 'anonymous private export', `/api/projects/${ownerProjectId}/export`, 'GET', undefined, [404]);

await expectStatus(owner, 'remix owned project', `/api/projects/${ownerProjectId}/remix`, 'POST', undefined, [200]);
await expectStatus(guest, 'remix guest-owned project', `/api/projects/${guestProjectId}/remix`, 'POST', undefined, [200]);
await expectStatus(stranger, 'remix private stranger project', `/api/projects/${ownerProjectId}/remix`, 'POST', undefined, [404]);
await expectStatus(anonymous, 'anonymous remix', `/api/projects/${ownerProjectId}/remix`, 'POST', undefined, [401]);

await expectStatus(owner, 'like owned project', `/api/projects/${ownerProjectId}/like`, 'POST', undefined, [200]);
await expectStatus(guest, 'like guest-owned project', `/api/projects/${guestProjectId}/like`, 'POST', undefined, [200]);
await expectStatus(stranger, 'like private stranger project', `/api/projects/${ownerProjectId}/like`, 'POST', undefined, [404]);
await expectStatus(anonymous, 'anonymous like', `/api/projects/${ownerProjectId}/like`, 'POST', undefined, [401]);

const invalidTexture = { dataUrl: 'not-a-png', projectId: ownerProjectId, name: 'invalid' };
await expectStatus(owner, 'authorized texture validation', '/api/uploads/texture', 'POST', invalidTexture, [400]);
await expectStatus(stranger, 'texture upload to another project', '/api/uploads/texture', 'POST', invalidTexture, [404]);
await expectStatus(anonymous, 'anonymous texture upload', '/api/uploads/texture', 'POST', invalidTexture, [404]);
const invalidGuestTexture = { ...invalidTexture, projectId: guestProjectId };
await expectStatus(guest, 'guest-owned texture validation', '/api/uploads/texture', 'POST', invalidGuestTexture, [400]);

for (const [path, fileField] of [['/api/uploads/audio', 'audio'], ['/api/uploads/model', 'file']]) {
  const ownerForm = new FormData();
  ownerForm.set('projectId', ownerProjectId);
  await expectStatus(owner, `authorized ${fileField} validation`, path, 'POST', ownerForm, [400]);
  const strangerForm = new FormData();
  strangerForm.set('projectId', ownerProjectId);
  await expectStatus(stranger, `${fileField} upload to another project`, path, 'POST', strangerForm, [404]);
}

const reportBody = { projectId: ownerProjectId, reason: 'spam', details: 'matrix report' };
await expectStatus(owner, 'report viewable owned project', '/api/reports', 'POST', reportBody, [200]);
await expectStatus(stranger, 'report hidden private project', '/api/reports', 'POST', reportBody, [404]);
await expectStatus(anonymous, 'anonymous reports fail closed until the persistent limiter', '/api/reports', 'POST', reportBody, [401]);
await expectStatus(guest, 'report guest-owned project', '/api/reports', 'POST', {
  ...reportBody, projectId: guestProjectId,
}, [200]);

for (const client of [owner, stranger, anonymous, guest]) {
  await expectStatus(client, 'admin users denied', '/api/admin/users', 'GET', undefined, [403]);
  await expectStatus(client, 'admin reports denied', '/api/admin/reports', 'GET', undefined, [403]);
}

const explore = await json(await anonymous.request('/api/projects/explore'));
assert.ok(Array.isArray(explore.projects), 'explore did not return a project array');
for (const privateId of [ownerProjectId, guestProjectId, strangerProjectId, ownerWorldId, guestWorldId, strangerWorldId]) {
  assert.equal(explore.projects.some((project) => project.id === privateId), false, 'private project leaked into Explore');
}
const explorePage = await anonymous.request('/explore');
assert.equal(explorePage.status, 200, 'Explore page must remain available to an anonymous visitor');
const exploreHtml = await explorePage.text();
for (const title of [`owner private world ${stamp}`, `guest private world ${stamp}`, `stranger private world ${stamp}`]) {
  assert.equal(exploreHtml.includes(title), false, 'private World Builder draft leaked into Explore page');
}
for (const project of explore.projects) {
  for (const forbidden of ['owner_id', 'profile_id', 'user_id', 'moderation_notes']) {
    assert.equal(forbidden in project, false, `Explore leaked ${forbidden}`);
  }
}

await expectStatus(stranger, 'delete another project', `/api/projects/${ownerProjectId}`, 'DELETE', undefined, [404]);
await expectStatus(anonymous, 'anonymous project delete', `/api/projects/${ownerProjectId}`, 'DELETE', undefined, [404]);
await expectStatus(stranger, 'delete another object', `/api/game-objects/${ownerObject.id}`, 'DELETE', undefined, [404]);
await expectStatus(anonymous, 'anonymous object delete', `/api/game-objects/${ownerObject.id}`, 'DELETE', undefined, [404]);

for (const [client, projectId] of [
  [owner, createdOwnerId],
  [guest, createdGuestId],
]) {
  await expectStatus(client, 'owner cleanup delete', `/api/projects/${projectId}`, 'DELETE', undefined, [200]);
}

console.log('\nauthorization matrix passed');
