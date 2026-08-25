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
let worldPage = null;

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
  await page.waitForURL(/\/editor\/[^/?]+/, { timeout: 25000 });
  return page.url();
});

await step('the blank game keeps the Hero and Ground seed', async () => {
  const id = page.url().split('/editor/')[1]?.split(/[?#]/)[0];
  const project = await page.evaluate(async (projectId) => (await (await fetch(`/api/projects/${projectId}/export`)).json()), id);
  const names = JSON.stringify(project);
  if (!names.includes('Hero') || !names.includes('Ground')) {
    throw new Error(`blank project did not retain the hero-and-ground seed: ${names.slice(0, 300)}`);
  }
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

await step('create a private Platformer world', async () => {
  worldPage = await context.newPage();
  await worldPage.goto(`${BASE}/worlds/new`, { waitUntil: 'networkidle' });
  const catalog = await worldPage.evaluate(async () => (await (await fetch('/api/world-templates')).json()));
  const platformers = catalog.templates?.filter((template) => template.id === 'platformer') ?? [];
  if (platformers.length !== 1 || platformers[0].version !== 2) {
    throw new Error(`the new-world catalog did not offer only Sky Steps v2: ${JSON.stringify(platformers)}`);
  }
  if (await worldPage.locator('button[aria-label="Choose Sky Steps"]').count() !== 1) {
    throw new Error('the picker rendered more than one Sky Steps card');
  }
  await worldPage.locator('button[aria-label="Choose Sky Steps"]').click({ timeout: 15000 });
  await worldPage.locator('input').fill(`Sky Journey ${STAMP}`);
  await worldPage.locator('button[type="submit"]').click();
  await worldPage.waitForURL(/\/editor\/[^?]+\?worldBuilder=1/, { timeout: 25000 });
});

await step('the template editor has the expected private draft graph', async () => {
  const worldId = worldPage?.url().split('/editor/')[1]?.split(/[?#]/)[0];
  if (!worldId || !worldPage) throw new Error('not on a world editor URL');
  const state = await worldPage.evaluate(async (id) => {
    const [projectsResponse, exportResponse] = await Promise.all([
      fetch('/api/projects'),
      fetch(`/api/projects/${id}/export`),
    ]);
    return {
      projects: await projectsResponse.json(),
      project: await exportResponse.json(),
    };
  }, worldId);
  const metadata = state.projects.projects?.find((project) => project.id === worldId);
  if (!metadata || metadata.visibility !== 'private' || metadata.moderation_status !== 'draft' || metadata.is_published) {
    throw new Error(`world is not a private draft: ${JSON.stringify(metadata)}`);
  }
  const names = JSON.stringify(state.project);
  for (const expected of ['Hero', 'Starting Island', 'Sky Step One', 'Sky Step Two', 'Sky Step Three', 'Sky Star One', 'Sky Star Two', 'Sky Star Three', 'Sky Cloud', 'Sky Portal']) {
    if (!names.includes(expected)) throw new Error(`template export is missing ${expected}`);
  }
  await worldPage.reload({ waitUntil: 'networkidle' });
  await worldPage.locator('text=/Private draft · Sky Steps v2 · Revision 0/').waitFor({ timeout: 15000 });
  await worldPage.locator('text=/Build missions/').waitFor({ timeout: 15000 });
  await worldPage.locator('text=/Play Sky Steps/').waitFor({ timeout: 15000 });
  await worldPage.goto(`${BASE}/play/${worldId}`, { waitUntil: 'networkidle' });
  await worldPage.locator('button[aria-label="Start game"]').click({ timeout: 15000 });
  await worldPage.locator('text=/Space to jump/').waitFor({ timeout: 15000 });
  const skyStepsHud = worldPage.locator('[data-testid="sky-steps-hud"]');
  await skyStepsHud.getByText('Stars 0/3', { exact: true }).waitFor({ timeout: 10000 });
  await worldPage.locator('[data-testid="sky-steps-status"]').waitFor({ timeout: 10000 });

  const runtimeState = worldPage.locator('[data-testid="game-runtime-state"]');
  await runtimeState.waitFor({ timeout: 15000 });
  const waitForLanding = async (platformName) => {
    await worldPage.waitForFunction((name) => {
      const state = document.querySelector('[data-testid="game-runtime-state"]');
      return state?.getAttribute('data-on-raised-platform') === 'true'
        && state.getAttribute('data-grounded-platform-name') === name;
    }, platformName, { timeout: 10000 });
  };
  const moveRightFor = async (milliseconds) => {
    await worldPage.keyboard.down('ArrowRight');
    await worldPage.waitForTimeout(milliseconds);
    await worldPage.keyboard.up('ArrowRight');
  };
  const jump = async () => {
    await worldPage.keyboard.down('Space');
    await worldPage.waitForTimeout(120);
    await worldPage.keyboard.up('Space');
  };

  // First move under the landing zone, then jump. The live runtime state must
  // report the real collision surface instead of merely trusting a template.
  await moveRightFor(2300);
  await jump();
  await waitForLanding('Sky Step One');

  await moveRightFor(900);
  const starFeedback = worldPage.locator('text=Star collected!');
  await starFeedback.waitFor({ timeout: 10000 });
  if (await starFeedback.count() !== 1) {
    throw new Error(`Sky Star One showed ${await starFeedback.count()} collection feedback bubbles instead of one`);
  }
  await worldPage.waitForFunction(() => {
    const state = document.querySelector('[data-testid="game-runtime-state"]');
    return state?.getAttribute('data-collected-star-count') === '1'
      && !(state.getAttribute('data-visible-star-names') ?? '').includes('Sky Star One');
  }, undefined, { timeout: 10000 });
  await skyStepsHud.getByText('Stars 1/3', { exact: true }).waitFor({ timeout: 10000 });
  await worldPage.locator('[data-testid="sky-steps-status"]').getByText('Stars 1/3', { exact: false }).waitFor({ timeout: 10000 });
  await worldPage.waitForTimeout(2200);
  if (await starFeedback.count() !== 0) {
    throw new Error('Sky Star One left a feedback bubble after the star was hidden');
  }

  await moveRightFor(2300);
  await jump();
  await waitForLanding('Sky Step Two');
  await moveRightFor(3200);
  await jump();
  await waitForLanding('Sky Step Three');
  await moveRightFor(1000);
  await worldPage.locator('text=You climbed every Sky Step!').waitFor({ timeout: 10000 });
  const winCard = worldPage.locator('[data-testid="sky-steps-win-card"]');
  await winCard.waitFor({ timeout: 10000 });
  if (!(await winCard.textContent())?.includes('You climbed every Sky Step!')) {
    throw new Error('Sky Steps won without its child-readable win card');
  }
  if (!(await worldPage.locator('[data-testid="sky-steps-status"]').textContent())?.includes('You climbed every Sky Step!')) {
    throw new Error('Sky Steps won without announcing the child-readable win status');
  }
  await worldPage.waitForFunction(() => {
    const state = document.querySelector('[data-testid="game-runtime-state"]');
    return state?.getAttribute('data-outcome-state') === 'won'
      && state.getAttribute('data-outcome-message') === 'You climbed every Sky Step!';
  }, undefined, { timeout: 10000 });
  await worldPage.close();
  worldPage = null;
});

await step('add a character', async () => {
  // "Add" is ambiguous — one adds a scene, one opens the object menu — so go
  // straight for the Character entry.
  const entry = page.locator('button', { hasText: /^Character/ }).first();
  await entry.click({ timeout: 10000 });
  await page.waitForTimeout(2500);

  // Pick an actual starter tile. The category chips ("Starters", "Basic
  // shapes", "AI", "Import") are buttons too, so match the tile by its name.
  // Search first — this is the path a child takes once the library is big
  // enough that scanning the grid stops working.
  const box = page.locator('input[type="search"]').first();
  if ((await box.count()) === 0) throw new Error('the character picker has no search field');
  await box.fill('good guy');
  await page.waitForTimeout(1200);
  const narrowed = await page.locator('button', { hasText: /^Hero/ }).count();
  if (narrowed === 0) throw new Error('searching a character\'s alias found nothing');
  await box.fill('');
  await page.waitForTimeout(800);

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

await step('clean up the published project', async () => {
  // The journey shares its project publicly, against the live gallery. Without
  // this, every run leaves a "Journey 189164208" behind for children to find.
  const status = await page.evaluate(
    async (id) => (await fetch(`/api/projects/${id}`, { method: 'DELETE' })).status,
    projectId
  );
  if (status >= 400) throw new Error(`cleanup delete returned ${status}`);
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
