/**
 * A private project must not be readable by a stranger.
 *
 * `/editor/<id>` checked ownership only inside `if (user && profileId)`, so a
 * signed-out visitor was not checked at all. Anyone holding the UUID could open
 * the editor for someone else's *private* project and read its title, scenes,
 * objects and scripts — all server-rendered into the HTML. The API behind that
 * same page returned 403 for the identical request, so the page was serving
 * what its own API refused to.
 *
 * Nothing errored. The page rendered a normal-looking editor.
 *
 * End-to-end because the bug lives in a server component's gate: it is only
 * visible in the bytes actually sent to an unauthenticated request.
 *
 *   node test/visual/private-project.mjs [base-url]
 */

import { chromium } from 'playwright';
import { assertLocalBaseUrl } from '../helpers/local-base-url.mjs';

const BASE = assertLocalBaseUrl(process.argv[2] || 'http://localhost:3100');
const STAMP = Date.now().toString(36);
const SECRET = `SECRET ${STAMP}`;

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

// --- an owner makes a project and leaves it private (the default) ---------
const ownerCtx = await browser.newContext();
const owner = await ownerCtx.newPage();
await owner.goto(`${BASE}/auth/signup`, { waitUntil: 'networkidle' });
const display = await owner.$('input[type="text"]');
if (display) await display.fill(`priv${STAMP}`.slice(0, 18));
await owner.fill('input[type="email"]', `priv${STAMP}@example.com`);
for (const f of await owner.$$('input[type="password"]')) await f.fill('Private!2345');
const dob = await owner.$('input[type="date"]');
if (dob) await dob.fill('2013-04-04');
for (const c of await owner.$$('input[type="checkbox"]')) await c.check().catch(() => {});
await owner.click('button[type="submit"]');
await owner.waitForURL((u) => !u.pathname.includes('/auth/signup'), { timeout: 30000 });

await owner.goto(`${BASE}/projects/new`, { waitUntil: 'networkidle' });
const title = await owner.$('input[type="text"]');
if (title) await title.fill(SECRET);
await (await owner.$('button[type="submit"]'))?.click();
await owner.waitForURL(/\/editor\/[^/]+/, { timeout: 40000 });
const projectId = owner.url().match(/editor\/([^/?#]+)/)[1];

const visibility = await owner.evaluate(
  async (id) => (await (await fetch(`/api/projects/${id}`)).json()).project.visibility,
  projectId
);
console.log(`\nowner's project is "${visibility}"`);
if (visibility !== 'private') {
  console.error('FAIL: a new project is not private by default — the premise is gone');
  process.exit(1);
}

// --- the owner can still open their own project --------------------------
const ownerReopen = await owner.goto(`${BASE}/editor/${projectId}`, {
  waitUntil: 'domcontentloaded',
});
await owner.waitForTimeout(3000);
const ownerSees = await owner.getByText(SECRET).count();
console.log(`owner reopening it       : ${ownerReopen.status()}, title visible: ${ownerSees > 0}`);

// --- a stranger with no account tries the same URL -----------------------
const anonCtx = await browser.newContext();
const anon = await anonCtx.newPage({ viewport: { width: 1440, height: 900 } });
const res = await anon.goto(`${BASE}/editor/${projectId}`, { waitUntil: 'domcontentloaded' });
await anon.waitForTimeout(3000);
const status = res.status();
const leaked = await anon.getByText(SECRET).count();
// The title could also be in the HTML without being rendered visibly.
const inHtml = (await anon.content()).includes(SECRET);
console.log(`stranger on /editor      : ${status}, title on page: ${leaked > 0}, title in HTML: ${inHtml}`);

const api = await anon.evaluate(async (id) => {
  const r = await fetch(`/api/projects/${id}`);
  return r.status;
}, projectId);
console.log(`stranger on the API      : ${api}`);

await anon.screenshot({ path: '/tmp/private-editor.png' });
await browser.close();

const problems = [];
if (ownerReopen.status() !== 200 || !ownerSees) problems.push('the owner can no longer open their own project');
if (status === 200) problems.push(`/editor returned 200 to a stranger (expected 404)`);
if (leaked || inHtml) problems.push('the private title reached a stranger');
if (api === 200) problems.push('the API served a private project to a stranger');

if (problems.length) {
  console.error(`\nFAIL\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\nprivate stays private, and the owner keeps access');
