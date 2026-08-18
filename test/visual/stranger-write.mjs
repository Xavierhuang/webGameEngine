/**
 * Can a stranger change a project they do not own?
 *
 * A signed-out visitor who opens /editor/<id> on someone else's *public*
 * project gets the whole editor — "EDITING <title>", a Save button, the object
 * palette, Ask AI. That is either a security hole (the writes land) or a lie
 * (they silently do not). This finds out which, and it matters for a product
 * whose users are children sharing work.
 *
 * Runs against a throwaway project it creates and publishes itself, so the
 * seeded examples are never touched.
 *
 *   node test/visual/stranger-write.mjs [base-url]
 */

import { chromium } from 'playwright';
import { assertLocalBaseUrl } from '../helpers/local-base-url.mjs';

const BASE = assertLocalBaseUrl(process.argv[2] || 'http://localhost:3100');
const STAMP = Date.now().toString(36);
const PASSWORD = 'Stranger!2345';

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

/** Sign up a fresh account and return its page. */
async function signUp(tag) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/auth/signup`, { waitUntil: 'networkidle' });
  const display = await page.$('input[type="text"]');
  if (display) await display.fill(`${tag}${STAMP}`.slice(0, 18));
  await page.fill('input[type="email"]', `${tag}${STAMP}@example.com`);
  for (const f of await page.$$('input[type="password"]')) await f.fill(PASSWORD);
  const dob = await page.$('input[type="date"]');
  if (dob) await dob.fill('2013-04-04');
  for (const c of await page.$$('input[type="checkbox"]')) await c.check().catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/auth/signup'), { timeout: 30000 });
  return { ctx, page };
}

// --- the owner builds and publishes something ----------------------------
const owner = await signUp('owner');
await owner.page.goto(`${BASE}/projects/new`, { waitUntil: 'networkidle' });
const title = await owner.page.$('input[type="text"]');
if (title) await title.fill(`Owned ${STAMP}`);
await (await owner.page.$('button[type="submit"]'))?.click();
await owner.page.waitForURL(/\/editor\/[^/]+/, { timeout: 40000 });
const projectId = owner.page.url().match(/editor\/([^/?#]+)/)[1];

const setup = await owner.page.evaluate(async (id) => {
  await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility: 'public', is_published: true }),
  });
  const project = (await (await fetch(`/api/projects/${id}`)).json()).project;
  const scene = project.scenes[0];
  await fetch('/api/ai/apply-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: id,
      update: {
        type: 'add_game_object',
        game_object: { scene_id: scene.id, type: 'character', name: 'Hero', color: '#6366f1' },
      },
    }),
  });
  const after = (await (await fetch(`/api/projects/${id}`)).json()).project;
  return { title: after.title, objectId: after.scenes[0].game_objects[0]?.id };
}, projectId);
console.log(`\nowner published "${setup.title}" (${projectId})\n`);

/** Every write a stranger could try, run from one browser context. */
async function attack(page, who) {
  return page.evaluate(
    async ({ id, objectId }) => {
      const call = async (label, url, method, body) => {
        try {
          const r = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
          });
          return { label, status: r.status };
        } catch (e) {
          return { label, status: `threw: ${e.message}` };
        }
      };
      return [
        await call('rename the project', `/api/projects/${id}`, 'PATCH', { title: 'VANDALISED' }),
        await call('unpublish it', `/api/projects/${id}`, 'PATCH', { visibility: 'private' }),
        await call('overwrite its scripts', `/api/game-objects/${objectId}/logic-blocks`, 'PUT', {
          blocks: [{ block_type: 'on_start' }, { block_type: 'game_over' }],
        }),
        await call('recolour an object', `/api/game-objects/${objectId}`, 'PATCH', {
          color: '#000000',
        }),
        await call('delete an object', `/api/game-objects/${objectId}`, 'DELETE'),
        await call('delete the project', `/api/projects/${id}`, 'DELETE'),
      ];
    },
    { id: projectId, objectId: setup.objectId }
  );
}

const results = {};

// A stranger with no account at all.
const anonCtx = await browser.newContext();
const anon = await anonCtx.newPage();
await anon.goto(`${BASE}/projects/${projectId}`, { waitUntil: 'networkidle' });
results['signed out'] = await attack(anon, 'signed out');

// A stranger who does have an account, but does not own this project.
const other = await signUp('other');
await other.page.goto(`${BASE}/projects/${projectId}`, { waitUntil: 'networkidle' });
results['another account'] = await attack(other.page, 'another account');

let holes = 0;
for (const [who, rows] of Object.entries(results)) {
  console.log(`as ${who}:`);
  for (const { label, status } of rows) {
    // 404 counts as blocked: an owner-scoped write that matched no row.
    // Reading only the status was not enough on its own — the delete route
    // used to answer 200 { success: true } after deleting nothing, so this
    // check reported a hole that did not exist. The project-state assertions
    // below are what actually settle it.
    const blocked = status === 401 || status === 403 || status === 404;
    if (!blocked) holes++;
    console.log(`  ${blocked ? 'blocked' : 'ALLOWED'}  ${status}  ${label}`);
  }
  console.log('');
}

// Did anything actually change?
const final = await owner.page.evaluate(
  async (id) => (await (await fetch(`/api/projects/${id}`)).json()).project,
  projectId
);
console.log(`title is still "${final?.title ?? '(project gone)'}"`);
console.log(`visibility is still "${final?.visibility ?? '(project gone)'}"`);
if (!final) holes++;
if (final && final.title !== setup.title) holes++;
if (final && final.visibility !== 'public') holes++;

// Clean up: this run publishes to the live gallery.
await owner.page.evaluate((id) => fetch(`/api/projects/${id}`, { method: 'DELETE' }), projectId);
await browser.close();
console.log(holes ? `\n${holes} write(s) a stranger should not have` : '\nno stranger can write');
process.exit(holes ? 1 : 0);
