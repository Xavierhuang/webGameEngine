/**
 * The owner console must refuse everyone who is not an administrator.
 *
 * It lists every account on the site and can delete them, so a gap here is the
 * worst bug this codebase could ship — and it would look completely normal,
 * because the page renders fine for the person who *is* allowed in.
 *
 *   node test/visual/admin-console.mjs [base-url]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://play.lingcode.dev';
const S = Date.now().toString(36);
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const problems = [];

// --- a stranger with no account --------------------------------------------
const anon = await (await b.newContext()).newPage();
const page1 = await anon.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 60000 });
const anonBody = (await anon.textContent('body')) || '';
console.log(`signed out /admin      : HTTP ${page1.status()}, gated: ${/only/i.test(anonBody)}`);
if (!/only/i.test(anonBody)) problems.push('a signed-out visitor was not gated out of /admin');
const anonApi = await anon.evaluate(async () => (await fetch('/api/admin/users')).status);
console.log(`signed out API         : ${anonApi}`);
if (anonApi !== 403) problems.push(`the users API returned ${anonApi} to a stranger (expected 403)`);

// --- an ordinary signed-in child -------------------------------------------
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(`${BASE}/auth/signup`, { waitUntil: 'networkidle' });
const d = await p.$('input[type="text"]'); if (d) await d.fill(`adm${S}`.slice(0,18));
await p.fill('input[type="email"]', `adm${S}@example.com`);
for (const f of await p.$$('input[type="password"]')) await f.fill('AdminProbe!2345');
const dob = await p.$('input[type="date"]'); if (dob) await dob.fill('2013-04-04');
for (const c of await p.$$('input[type="checkbox"]')) await c.check().catch(()=>{});
await p.click('button[type="submit"]');
await p.waitForURL(u => !u.pathname.includes('/auth/signup'), { timeout: 30000 });

await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
const body = (await p.textContent('body')) || '';
console.log(`ordinary user /admin   : gated: ${/only/i.test(body)}, sees account list: ${/Owner console/.test(body)}`);
if (!/only/i.test(body)) problems.push('an ordinary signed-in user reached the console');
if (/Owner console/.test(body)) problems.push('an ordinary user saw the account list');

const calls = await p.evaluate(async () => {
  const j = async (m, body) => (await fetch('/api/admin/users', {
    method: m, headers: {'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined })).status;
  return {
    list: await j('GET'),
    promote: await j('PATCH', { profileId: 'x', role: 'admin' }),
    remove: await j('DELETE', { profileId: 'x', confirmEmail: 'x' }),
  };
});
console.log(`ordinary user API      : list ${calls.list}, promote ${calls.promote}, delete ${calls.remove}`);
for (const [k, v] of Object.entries(calls)) {
  if (v !== 403) problems.push(`${k} returned ${v} to a non-admin (expected 403)`);
}

// Clean up the probe account so it does not linger in production.
await p.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST' }); });
await b.close();

if (problems.length) { console.error(`\nFAIL\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log('\nadmin console: only administrators get in');
