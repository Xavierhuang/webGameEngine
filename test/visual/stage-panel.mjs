/**
 * Does the Logic tab's stage really run the script?
 *
 * The Logic tab used to be blocks and nothing else, so Preview had nowhere to
 * preview to — which is what "where should I see the smoke?" was really asking.
 * This drives the whole path: sign up, make a project, give a character
 * `on start / start confetti / show message`, open Logic, and photograph it.
 *
 * Full-page screenshot on purpose. An element-level screenshot of a WebGL
 * canvas returns a stale buffer without preserveDrawingBuffer, which produced
 * two rounds of byte-identical images earlier in this project.
 *
 *   node test/visual/stage-panel.mjs [base-url]
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3010';
const STAMP = Date.now().toString(36);
const EMAIL = `stage${STAMP}@example.com`;
const PASSWORD = 'StagePanel!2345';
const SHOT = '/tmp/stage3.png';

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('  uncaught:', e.message.split('\n')[0]));

// --- sign up -------------------------------------------------------------
await page.goto(`${BASE}/auth/signup`, { waitUntil: 'networkidle' });
const display = await page.$('input[type="text"]');
if (display) await display.fill(`stage${STAMP}`.slice(0, 18));
await page.fill('input[type="email"]', EMAIL);
for (const f of await page.$$('input[type="password"]')) await f.fill(PASSWORD);
const dob = await page.$('input[type="date"]');
if (dob) await dob.fill('2012-05-05');
for (const c of await page.$$('input[type="checkbox"]')) await c.check().catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes('/auth/signup'), { timeout: 30000 });

// --- create a project ----------------------------------------------------
await page.goto(`${BASE}/projects/new`, { waitUntil: 'networkidle' });
const title = await page.$('input[type="text"]');
if (title) await title.fill(`Stage ${STAMP}`);
const submit = await page.$('button[type="submit"]');
if (submit) await submit.click();
await page.waitForURL(/\/editor\/[^/]+/, { timeout: 40000 });
await page.waitForTimeout(4000);
const projectId = page.url().match(/editor\/([^/?#]+)/)[1];

// --- a character, and the script it runs ---------------------------------
// Both go in through the editor's own APIs. Dragging a starter out of the
// picker and Blockly blocks off the palette is not what is under test here.
const wrote = await page.evaluate(async (id) => {
  const projectOf = async () => (await (await fetch(`/api/projects/${id}`)).json()).project;
  const scene = (await projectOf()).scenes[0];

  const added = await fetch('/api/ai/apply-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: id,
      update: {
        type: 'add_game_object',
        game_object: {
          scene_id: scene.id,
          type: 'character',
          name: 'Hero',
          position_x: 500,
          position_y: 300,
          position_z: 0,
          color: '#6366f1',
          width: 131,
          height: 131,
        },
      },
    }),
  });
  if (!added.ok) return { error: `add_game_object ${added.status}` };

  const hero = (await projectOf()).scenes[0].game_objects.find((o) => o.name === 'Hero');
  if (!hero) return { error: 'the object did not persist' };

  const res = await fetch(`/api/game-objects/${hero.id}/logic-blocks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // `inputs`, not `block_data`: the route builds block_data itself and
      // drops anything it does not recognise, so a block_data payload saves
      // as a block with every field empty and no error anywhere.
      blocks: [
        { block_type: 'on_start' },
        { block_type: 'start_particles', inputs: { effect: 'confetti' } },
        { block_type: 'show_message', inputs: { text: 'Building!', seconds: 30 } },
      ],
    }),
  });
  return { hero: hero.name, blocks: res.status };
}, projectId);
console.log('set up:', JSON.stringify(wrote));
if (wrote.error) {
  console.error(`FAIL: could not set the project up — ${wrote.error}`);
  process.exit(1);
}

// --- open Logic and look ------------------------------------------------
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
// Select the Hero so the blocks show beside the stage. The stage itself no
// longer depends on this — it used to, and an empty selection replaced it.
await page.getByText('Hero', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Logic' }).first().click();
await page.waitForTimeout(7000);

// Scoped to the stage panel. An unscoped getByText('Building!') also matches
// the text field inside the Blockly block, which reads as a pass while the
// stage sits there doing nothing.
const stage = page.locator('[data-stage-panel]');
const canvases = await page.locator('canvas').count();
const banner = await stage.getByText('Building!').count();
console.log(`canvases on the Logic tab: ${canvases}`);
console.log(`banner in the stage: ${banner > 0}`);

await page.screenshot({ path: SHOT });
console.log(`wrote ${SHOT}`);
await browser.close();

if (canvases < 1) {
  console.error('FAIL: the Logic tab has no stage');
  process.exit(1);
}
if (banner < 1) {
  console.error('FAIL: the script did not run in the stage (no banner)');
  process.exit(1);
}
console.log('\nstage panel: the Logic tab runs the script');
