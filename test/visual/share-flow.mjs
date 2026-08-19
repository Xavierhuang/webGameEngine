/**
 * What sharing actually looks like to a child.
 *
 * The journey already proves the share path *works* mechanically. This one is
 * about whether it is usable: how many steps from "I built something" to "my
 * friend is playing it", whether there is a link to copy, and whether the
 * person receiving that link can play and remix it without an account.
 *
 * Photographs each screen so the answer is looked at, not inferred.
 *
 *   node test/visual/share-flow.mjs [base-url]
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://play.lingcode.dev';
const STAMP = Date.now().toString(36);
const EMAIL = `share${STAMP}@example.com`;
const PASSWORD = 'ShareFlow!2345';

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const notes = [];
const note = (s) => { notes.push(s); console.log(`  ${s}`); };

// --- sign up and make something -----------------------------------------
await page.goto(`${BASE}/auth/signup`, { waitUntil: 'networkidle' });
const display = await page.$('input[type="text"]');
if (display) await display.fill(`share${STAMP}`.slice(0, 18));
await page.fill('input[type="email"]', EMAIL);
for (const f of await page.$$('input[type="password"]')) await f.fill(PASSWORD);
const dob = await page.$('input[type="date"]');
if (dob) await dob.fill('2013-04-04');
for (const c of await page.$$('input[type="checkbox"]')) await c.check().catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes('/auth/signup'), { timeout: 30000 });

await page.goto(`${BASE}/projects/new`, { waitUntil: 'networkidle' });
const title = await page.$('input[type="text"]');
if (title) await title.fill(`Shared ${STAMP}`);
await (await page.$('button[type="submit"]'))?.click();
await page.waitForURL(/\/editor\/[^/]+/, { timeout: 40000 });
await page.waitForTimeout(4000);
const projectId = page.url().match(/editor\/([^/?#]+)/)[1];

// The first-run tutorial panel opens over the editor and swallows clicks, so
// a first-time child has to close it before they can reach Share at all.
const closeTutorials = page
  .locator('button[aria-label="Close tutorials"], button:has-text("Close")')
  .first();
const hadTutorial = (await closeTutorials.count()) > 0;
if (hadTutorial) await closeTutorials.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1200);
note(`first-run tutorial had to be closed before Share was reachable: ${hadTutorial}`);

// --- how many clicks to share? ------------------------------------------
await page.getByRole('button', { name: /^Share$/ }).first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/share-1-dialog.png' });

const publish = page.locator('button', { hasText: /share publicly|publish|make public/i }).first();
if (!(await publish.count())) throw new Error('no publish control in the share dialog');
await publish.click();
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/share-2-published.png' });

// Is there a link to hand to a friend, and does the copy button work?
const linkField = page.locator('input[readonly], input[value*="/play/"]');
note(`copyable link field: ${(await linkField.count()) > 0}`);
const copy = page.locator('button', { hasText: /copy/i }).first();
note(`copy button: ${(await copy.count()) > 0}`);

// --- the friend's side, with no account ----------------------------------
const anon = await browser.newContext();
const visitor = await anon.newPage();

const play = await visitor.goto(`${BASE}/play/${projectId}`, { waitUntil: 'networkidle' });
note(`signed-out /play returns ${play.status()}`);
await visitor.waitForSelector('canvas', { timeout: 30000 }).catch(() => {});
await visitor.screenshot({ path: '/tmp/share-3-friend-plays.png' });

const landing = await visitor.goto(`${BASE}/projects/${projectId}`, { waitUntil: 'networkidle' });
note(`signed-out project page returns ${landing.status()}`);
const remixBtn = visitor.locator('button, a').filter({ hasText: /remix/i });
note(`remix button on the project page: ${(await remixBtn.count()) > 0}`);
await visitor.screenshot({ path: '/tmp/share-4-project-page.png' });

// --- and can they find it without the link? ------------------------------
await visitor.goto(`${BASE}/explore`, { waitUntil: 'networkidle' });
const listed = await visitor.getByText(`Shared ${STAMP}`).count();
note(`appears in /explore without a direct link: ${listed > 0}`);
await visitor.screenshot({ path: '/tmp/share-5-explore.png' });

await anon.close();
// Clean up after ourselves. These runs publish to the *live* gallery, and a
// child browsing Explore should not find "Shared msxdvhso" sitting among the
// real games. Five such projects had already accumulated there.
await page.evaluate((id) => fetch(`/api/projects/${id}`, { method: 'DELETE' }), projectId);
console.log('  cleaned up the published test project');
await browser.close();
console.log('\nscreenshots: /tmp/share-1-dialog.png … share-5-explore.png');
