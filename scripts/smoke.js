#!/usr/bin/env node
/**
 * Browser smoke test: loads each page in real Chromium and fails on any
 * client-side exception, console error, or failed asset request.
 *
 * This exists because a deploy once white-screened the site with
 * "Application error: a client-side exception has occurred" while every
 * `curl` check returned HTTP 200 — the server-rendered HTML was fine and the
 * failure was purely client-side. Status codes are not proof a page works.
 *
 * Usage:
 *   node scripts/smoke.js                       # http://localhost:3000
 *   node scripts/smoke.js https://play.lingcode.dev
 */

const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

const PAGES = [
  { path: '/', expect: 'Make 3D games' },
  { path: '/explore', expect: 'Explore' },
  { path: '/privacy', expect: 'Privacy policy' },
  { path: '/projects', expect: 'Games' },
  { path: '/projects/new', expect: null },
  { path: '/auth/signup', expect: 'account' },
  { path: '/auth/login', expect: null },
  { path: '/parent/consent?token=smoke', expect: 'permission' },
  { path: '/admin/reports', expect: null },
];

/**
 * Noise we deliberately tolerate: analytics/asset 404s that don't break the
 * app, and React's dev-only warnings. Anything else is a failure.
 */
const IGNORE = [/favicon/i, /manifest\.json/i, /Download the React DevTools/i];

function ignorable(text) {
  return IGNORE.some((re) => re.test(text));
}

(async () => {
  const browser = await chromium.launch();
  let failures = 0;

  for (const { path, expect } of PAGES) {
    const page = await browser.newPage();
    const problems = [];

    page.on('pageerror', (e) => problems.push(`uncaught: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !ignorable(m.text())) problems.push(`console: ${m.text().slice(0, 160)}`);
    });
    page.on('requestfailed', (r) => {
      // Next.js prefetches <Link> targets as `?_rsc=` requests and aborts any
      // still in flight when the page unloads. Those aborts are routine and say
      // nothing about whether the page works, so they are not failures.
      const url = r.url();
      const aborted = (r.failure()?.errorText || '').includes('ERR_ABORTED');
      if (url.includes('_rsc=') || aborted || ignorable(url)) return;
      problems.push(`asset failed: ${url.split('/').slice(-1)[0]}`);
    });
    page.on('response', (r) => {
      // A missing JS chunk is the exact failure mode this script guards against.
      if (r.status() >= 400 && /\.(js|css)$/.test(new URL(r.url()).pathname) && !ignorable(r.url())) {
        problems.push(`chunk ${r.status()}: ${r.url().split('/').slice(-1)[0]}`);
      }
    });

    try {
      const response = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
      const status = response ? response.status() : 0;
      const body = ((await page.textContent('body')) || '').trim();

      if (status >= 400) problems.push(`HTTP ${status}`);
      if (body.includes('Application error')) problems.push('rendered Next.js error boundary');
      if (body.length < 40) problems.push(`page is essentially empty (${body.length} chars)`);
      if (expect && !body.includes(expect)) problems.push(`missing expected text: "${expect}"`);
    } catch (e) {
      problems.push(`navigation failed: ${e.message.split('\n')[0]}`);
    }

    if (problems.length) {
      failures++;
      console.log(`FAIL ${path}`);
      for (const p of problems.slice(0, 4)) console.log(`       ${p}`);
    } else {
      console.log(`ok   ${path}`);
    }

    await page.close();
  }

  await browser.close();

  if (failures > 0) {
    console.log(`\n${failures} page(s) failed against ${BASE}`);
    process.exit(1);
  }
  console.log(`\nAll ${PAGES.length} pages render cleanly against ${BASE}`);
})().catch((e) => {
  console.error('smoke run failed:', e.message);
  process.exit(1);
});
