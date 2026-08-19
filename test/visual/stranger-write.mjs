/**
 * Prove anonymous and authenticated strangers cannot mutate a published
 * project. The only direct database operation is the test-only publication
 * bridge, which refuses every target except loopback gameengine_test.
 *
 *   MYSQL_DATABASE=gameengine_test node test/visual/stranger-write.mjs [base-url]
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertLocalBaseUrl } from '../helpers/local-base-url.mjs';
import {
  deleteProjectForTest,
  publishProjectForTest,
  withLocalTestDatabase,
} from '../helpers/local-test-database.mjs';

const BASE = assertLocalBaseUrl(process.argv[2] || 'http://localhost:3100');
const STAMP = Date.now().toString(36);
const PASSWORD = 'Stranger!2345';
const ORIGINAL = {
  title: `Owned ${STAMP}`,
  color: '#6366f1',
  logicBlocks: [
    {
      block_type: 'on_start',
      category: 'event',
      order_index: 0,
      block_data: { note: 'must survive attacks' },
    },
  ],
};

let browser;
let owner;
let projectId;

async function signUp(tag) {
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
  const response = await page.request.post(`${BASE}/api/auth/signup`, {
    data: {
      email: `${tag}${STAMP}@example.com`,
      password: PASSWORD,
      displayName: `${tag}${STAMP}`.slice(0, 18),
      dateOfBirth: '2013-04-04',
      acceptedTerms: true,
      acceptedPrivacy: true,
    },
  });
  assert.equal(response.status(), 200, `${tag} signup must return exact 200: ${await response.text()}`);
  return { context, page };
}

async function api(page, path, method = 'GET', data) {
  const options = { method };
  if (data !== undefined) options.data = data;
  return page.request.fetch(`${BASE}${path}`, options);
}

async function importProject(page) {
  const sceneId = `scene-${STAMP}`;
  const objectId = `object-${STAMP}`;
  const response = await api(page, '/api/projects/import', 'POST', {
    format: 'lingplay-project',
    project: { title: ORIGINAL.title, description: 'authorization matrix fixture' },
    scenes: [{ id: sceneId, name: 'Scene 1', order_index: 0 }],
    game_objects: [
      {
        id: objectId,
        scene_id: sceneId,
        type: 'character',
        name: 'Hero',
        color: ORIGINAL.color,
      },
    ],
    logic_blocks: ORIGINAL.logicBlocks.map((block) => ({
      ...block,
      game_object_id: objectId,
    })),
  });
  assert.equal(response.status(), 200, `import must return exact 200: ${await response.text()}`);
  const payload = await response.json();
  assert.match(payload?.project?.id || '', /^[0-9a-f-]{36}$/i, 'import must return a project ID');
  return payload.project.id;
}

async function readProject(page, id) {
  const response = await api(page, `/api/projects/${id}`);
  assert.equal(response.status(), 200, `owner project read must return exact 200: ${await response.text()}`);
  return (await response.json()).project;
}

async function attack(page, expectedStatus) {
  const current = await readProject(owner.page, projectId);
  const objectId = current.scenes[0]?.game_objects[0]?.id;
  assert.ok(objectId, 'setup must produce a game object ID');

  const attempts = [
    ['rename project', `/api/projects/${projectId}`, 'PATCH', { title: 'VANDALISED' }],
    ['unpublish project', `/api/projects/${projectId}`, 'PATCH', { visibility: 'private' }],
    ['overwrite logic', `/api/game-objects/${objectId}/logic-blocks`, 'PUT', {
      blocks: [{ block_type: 'game_over', category: 'action', block_data: {} }],
    }],
    ['recolour object', `/api/game-objects/${objectId}`, 'PATCH', { color: '#000000' }],
    ['delete object', `/api/game-objects/${objectId}`, 'DELETE'],
    ['delete project', `/api/projects/${projectId}`, 'DELETE'],
  ];

  for (const [label, path, method, data] of attempts) {
    const response = await api(page, path, method, data);
    assert.equal(
      response.status(),
      expectedStatus,
      `${label} returned ${response.status()}; expected exact ${expectedStatus}: ${await response.text()}`
    );
  }
}

try {
  browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  owner = await signUp('owner');
  projectId = await importProject(owner.page);

  const imported = await readProject(owner.page, projectId);
  const objectId = imported.scenes[0]?.game_objects[0]?.id;
  assert.ok(objectId, 'imported object ID must exist');
  const baselineObject = imported.scenes[0].game_objects[0];
  assert.equal(baselineObject.color, ORIGINAL.color);
  assert.equal(baselineObject.logic_blocks.length, 1);
  assert.equal(baselineObject.logic_blocks[0].block_type, ORIGINAL.logicBlocks[0].block_type);
  assert.equal(baselineObject.logic_blocks[0].category, ORIGINAL.logicBlocks[0].category);
  assert.equal(baselineObject.logic_blocks[0].order_index, ORIGINAL.logicBlocks[0].order_index);

  await withLocalTestDatabase(BASE, (connection) => publishProjectForTest(connection, projectId));
  const published = await readProject(owner.page, projectId);
  assert.equal(published.visibility, 'public');
  assert.equal(published.moderation_status, 'published');

  const anonymousContext = await browser.newContext();
  const anonymous = await anonymousContext.newPage();
  const anonymousPublicPage = await anonymous.goto(`${BASE}/projects/${projectId}`, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal(anonymousPublicPage.status(), 200, 'anonymous public page must return exact 200');
  assert.match(await anonymous.content(), new RegExp(ORIGINAL.title));
  await attack(anonymous, 404);

  const stranger = await signUp('stranger');
  const strangerPublicPage = await stranger.page.goto(`${BASE}/projects/${projectId}`, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal(strangerPublicPage.status(), 200, 'stranger public page must return exact 200');
  assert.match(await stranger.page.content(), new RegExp(ORIGINAL.title));
  await attack(stranger.page, 403);

  const final = await readProject(owner.page, projectId);
  assert.equal(final.title, ORIGINAL.title);
  assert.equal(final.visibility, 'public');
  assert.equal(final.moderation_status, 'published');
  const finalObject = final.scenes[0]?.game_objects.find((object) => object.id === objectId);
  assert.ok(finalObject, 'object must still exist');
  assert.equal(finalObject.color, ORIGINAL.color);
  assert.deepEqual(finalObject.logic_blocks, baselineObject.logic_blocks);

  console.log('anonymous and authenticated stranger writes were denied; state is unchanged');
} finally {
  if (projectId) {
    let deleted = false;
    if (owner?.page) {
      try {
        const response = await api(owner.page, `/api/projects/${projectId}`, 'DELETE');
        deleted = response.status() === 200;
      } catch {
        // Fall through to the local test-database cleanup.
      }
    }
    if (!deleted) {
      await withLocalTestDatabase(BASE, (connection) => deleteProjectForTest(connection, projectId));
    }
  }
  await browser?.close();
}
