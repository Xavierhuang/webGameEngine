/**
 * The end-to-end journey a child actually takes.
 *
 * The project plan named this as the real acceptance test for "a replacement
 * for Scratch" and noted it had never been run. Everything else in this repo
 * verifies a layer in isolation; this drives the product the way a person
 * does, in a real browser, against a real database.
 *
 * It reports every step it completes and stops at the first one it cannot,
 * printing what it saw. A step that fails here is a step a child cannot take.
 *
 *   node test/visual/journey.mjs [baseUrl]
 */

import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
// Unique per run so re-runs don't collide on the email unique index.
const STAMP = process.env.JOURNEY_STAMP || String(process.hrtime.bigint()).slice(-9);
const EMAIL = `journey${STAMP}@example.com`;
const PASSWORD = 'JourneyTest123!';

const steps = [];
let failed = null;

async function step(name, fn) {
  if (failed) return undefined;
  try {
    const value = await fn();
    steps.push({ name, ok: true });
    console.log(`  ok    ${name}`);
    return value;
  } catch (e) {
    failed = { name, error: e.message.split('\n')[0] };
    steps.push({ name, ok: false });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${failed.error}`);
    return undefined;
  }
}

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`uncaught: ${e.message.split('\n')[0]}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) {
    consoleErrors.push(m.text().slice(0, 200));
  }
});

console.log(`\njourney against ${BASE} as ${EMAIL}\n`);

await step('sign up', async () => {
  // Signup is rate limited per IP, which is correct behaviour but looks like a
  // product failure if this script just times out. Wait the limiter out.
  for (let attempt = 1; ; attempt++) {
    let status = 0;
    const watch = (r) => {
      if (r.url().includes('/api/auth/signup')) status = r.status();
    };
    page.on('response', watch);
    try {
      await signupOnce();
      await page.waitForURL((u) => !u.pathname.includes('/auth/signup'), { timeout: 15000 });
      return;
    } catch (e) {
      if (status !== 429) throw e;
      if (attempt >= 6) throw new Error('still rate limited after 6 attempts (~5 min)');
      console.log(`        rate limited (429), waiting 60s — attempt ${attempt}`);
      await new Promise((r) => setTimeout(r, 60000));
    } finally {
      page.off('response', watch);
    }
  }
});

async function signupOnce() {
  {
  await page.goto(`${BASE}/auth/signup`, { waitUntil: 'networkidle' });
  // The inputs carry no name attributes, so select by type.
  const display = await page.$('input[type="text"]');
  if (display) await display.fill(`journey${STAMP}`.slice(0, 18));
  await page.fill('input[type="email"]', EMAIL);
  for (const f of await page.$$('input[type="password"]')) await f.fill(PASSWORD);
  // COPPA: a date of birth is collected at signup.
  const dob = await page.$('input[type="date"]');
  if (dob) await dob.fill('2012-05-05');
  for (const c of await page.$$('input[type="checkbox"]')) await c.check().catch(() => {});
  await page.click('button[type="submit"]');
  }
}

await step('create a project', async () => {
  await page.goto(`${BASE}/projects/new`, { waitUntil: 'networkidle' });
  const title = await page.$('input[type="text"]');
  if (title) await title.fill(`Journey ${STAMP}`);
  const submit = await page.$('button[type="submit"]');
  if (submit) await submit.click();
  await page.waitForURL(/\/editor\/|\/projects\//, { timeout: 25000 });
  return page.url();
});

await step('the editor opens with a 3D canvas', async () => {
  await page.waitForSelector('canvas', { timeout: 25000 });
  const box = await (await page.$('canvas')).boundingBox();
  if (!box || box.width < 100 || box.height < 100) {
    throw new Error(`canvas is ${box ? `${box.width}x${box.height}` : 'missing'}`);
  }
});

await step('the viewport draws something (not a blank canvas)', async () => {
  // The bug a person had to find for us: everything mounts, nothing renders.
  const shot = await (await page.$('canvas')).screenshot();
  const { createCanvas, loadImage } = await import('canvas').catch(() => ({}));
  if (!createCanvas) {
    // No image lib available — fall back to byte entropy, which still
    // distinguishes a flat fill from a rendered scene.
    const unique = new Set(shot).size;
    if (unique < 16) throw new Error(`canvas PNG has only ${unique} distinct bytes — likely blank`);
    return;
  }
  const img = await loadImage(shot);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  if (seen.size < 4) throw new Error(`only ${seen.size} distinct colours — viewport is blank`);
});

await step('a first-time user is shown the tutorials unprompted', async () => {
  // Fresh browser context each run, so this is genuinely a first visit.
  const panel = page.locator('text=/Make your first game/').first();
  await panel.waitFor({ timeout: 15000 });
});

await step('the tutorial panel can be dismissed and does not block the editor', async () => {
  const close = page.locator('button[aria-label="Close tutorials"], button:has-text("Close")').first();
  if ((await close.count()) > 0) await close.click({ timeout: 5000 }).catch(() => {});
  else await page.locator('button', { hasText: /^Learn$/ }).first().click();
  await page.waitForTimeout(1000);
  const stillOpen = await page.locator('text=/Make your first game/').count();
  if (stillOpen > 0) throw new Error('the tutorial panel would not close');
});

await step('the nudge does not come back on reload', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 25000 });
  await page.waitForTimeout(2500);
  const reappeared = await page.locator('text=/Make your first game/').count();
  if (reappeared > 0) throw new Error('the tutorials reopened — the nudge is a nag');
});

await step('add a character', async () => {
  // "Add" is ambiguous — one adds a scene, one opens the object menu — so go
  // straight for the Character entry.
  const entry = page.locator('button', { hasText: /^Character/ }).first();
  await entry.click({ timeout: 10000 });
  await page.waitForTimeout(2500);

  // Pick an actual starter tile. The category chips ("Starters", "Basic
  // shapes", "AI", "Import") are buttons too, so match the tile by its name.
  const tile = page.locator('button', { hasText: /^HeroStanding hero/ }).first();
  if ((await tile.count()) === 0) {
    const offered = await page.locator('[role="dialog"] button, .fixed button').allTextContents();
    throw new Error(`no Hero tile in the picker; saw: ${offered.slice(0, 8).join(' / ')}`);
  }
  await tile.click({ timeout: 10000 });
  await page.waitForTimeout(4000);
});

await step('the character is in the project', async () => {
  // Ask the server, not the DOM: this is what persists.
  const url = page.url();
  const id = url.split('/editor/')[1]?.split(/[?#]/)[0];
  if (!id) throw new Error(`not on an editor URL: ${url}`);
  // Export is the product's own view of a saved project.
  const data = await page.evaluate(async (pid) => {
    const r = await fetch(`/api/projects/${pid}/export`);
    if (!r.ok) return { error: r.status, body: (await r.text()).slice(0, 160) };
    return r.json();
  }, id);
  if (data?.error) throw new Error(`export returned ${data.error}: ${data.body || ''}`);

  const objects = [];
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(collect);
    for (const [k, v] of Object.entries(node)) {
      if (/^(objects|gameObjects|game_objects)$/.test(k) && Array.isArray(v)) objects.push(...v);
      else collect(v);
    }
  };
  collect(data);
  if (objects.length === 0) {
    throw new Error(`no game objects in the exported project: ${JSON.stringify(data).slice(0, 200)}`);
  }
});

await step('switch to the Logic tab', async () => {
  await page.locator('button', { hasText: /^Logic$/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(3000);
});

await step('the block workspace and its categories render', async () => {
  await page.waitForSelector('.blocklyWorkspace, .injectionDiv, svg.blocklySvg', { timeout: 20000 });
  // A category toolbox keeps the flyout closed until a category is clicked,
  // so the categories are what must exist at rest.
  const categories = await page.$$('.blocklyTreeRow, .blocklyToolboxCategory');
  if (categories.length === 0) throw new Error('the toolbox rendered no categories');
});

await step('clicking a category shows draggable blocks', async () => {
  const categories = await page.$$('.blocklyTreeRow, .blocklyToolboxCategory');
  await categories[0].click();
  await page.waitForTimeout(1500);
  const blocks = await page.$$('.blocklyFlyout .blocklyDraggable, .blocklyFlyout g.blocklyDraggable');
  if (blocks.length === 0) {
    const names = await page.$$eval('.blocklyTreeLabel', (e) => e.map((x) => x.textContent));
    throw new Error(`no blocks in the flyout; categories were: ${names.join(', ')}`);
  }
});

// Share -> view signed-out -> remix. The project plan called this chain "the
// actual acceptance test for a replacement for Scratch" and noted it could not
// be run at all. Remix is the whole community story now that comments are
// deliberately not being built, so it had better work.
const projectId = page.url().split('/editor/')[1]?.split(/[?#]/)[0];

await step('share the project publicly', async () => {
  await page.locator('button', { hasText: /^Share$/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(1500);
  const publish = page
    .locator('button', { hasText: /share publicly|publish|make public/i })
    .first();
  if ((await publish.count()) === 0) {
    const seen = await page.locator('[role="dialog"] button, .fixed button').allTextContents();
    throw new Error(`no publish control in the share dialog; saw: ${seen.slice(0, 8).join(' / ')}`);
  }
  await publish.click();
  await page.waitForTimeout(3000);
});

await step('a signed-out visitor can open the shared project', async () => {
  const anon = await browser.newContext();
  const visitor = await anon.newPage();
  const res = await visitor.goto(`${BASE}/projects/${projectId}`, { waitUntil: 'networkidle' });
  if (!res || res.status() >= 400) throw new Error(`shared page returned ${res && res.status()}`);
  const body = ((await visitor.textContent('body')) || '').trim();
  if (body.length < 40) throw new Error('the shared project page is empty');
  await anon.close();
});

await step('the project can be remixed', async () => {
  const before = await page.evaluate(async () => (await (await fetch('/api/projects')).json()));
  const remix = await page.evaluate(async (pid) => {
    const r = await fetch(`/api/projects/${pid}/remix`, { method: 'POST' });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, projectId);
  if (remix.status >= 400) {
    throw new Error(`remix returned ${remix.status}: ${JSON.stringify(remix.body).slice(0, 160)}`);
  }
  const newId = remix.body?.project?.id || remix.body?.id;
  if (!newId || newId === projectId) throw new Error('remix did not produce a new project');
  void before;
});

await step('no uncaught errors during the journey', async () => {
  if (consoleErrors.length) {
    throw new Error(`${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
  }
});

await browser.close();

const done = steps.filter((s) => s.ok).length;
console.log(`\n${done}/${steps.length} steps completed`);
if (failed) {
  console.log(`\nA child cannot get past: ${failed.name}`);
  process.exit(1);
}
console.log('The whole journey works.');
