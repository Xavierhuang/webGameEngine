#!/usr/bin/env node
/**
 * Accessibility checks in real Chromium.
 *
 * This product is aimed at classrooms, where accessibility is often a
 * procurement requirement and always the right thing. Nothing here had ever
 * been checked; the first run found two unlabelled inputs.
 *
 * These are the mechanical checks a machine can make honestly. They are not a
 * substitute for testing with an actual screen-reader user.
 *
 * Usage: node scripts/a11y.js [baseUrl]
 */

const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

const PAGES = ['/', '/explore', '/learn', '/projects', '/auth/signup', '/auth/login', '/privacy'];

/** Static checks run inside the page. */
function auditInPage() {
  const issues = [];

  // A screen reader announces nothing for an image with no alt attribute.
  const noAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt'));
  if (noAlt.length) issues.push(`${noAlt.length} image(s) without an alt attribute`);

  // Icon-only buttons are the usual offender: visually obvious, silent to AT.
  const unnamedButtons = [...document.querySelectorAll('button')].filter((b) => {
    const text = (b.textContent || '').trim();
    return !text && !b.getAttribute('aria-label') && !b.getAttribute('title');
  });
  if (unnamedButtons.length) issues.push(`${unnamedButtons.length} button(s) with no accessible name`);

  const unlabelled = [...document.querySelectorAll('input, select, textarea')].filter((el) => {
    if (el.type === 'hidden') return false;
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
    if (el.closest('label')) return false;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
    // A placeholder is weak labelling but it is announced, so not a failure.
    return !el.getAttribute('placeholder');
  });
  if (unlabelled.length) issues.push(`${unlabelled.length} form field(s) with no label`);

  // Heading structure is how screen-reader users skim a page.
  if (!document.querySelector('h1')) issues.push('no <h1>');
  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
  let skips = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) skips++;
  if (skips) issues.push(`${skips} heading level skip(s)`);

  // The document language drives screen-reader pronunciation.
  if (!document.documentElement.getAttribute('lang')) issues.push('<html> has no lang');

  return issues;
}

(async () => {
  const browser = await chromium.launch();
  let failures = 0;

  for (const path of PAGES) {
    const page = await browser.newPage();
    const problems = [];

    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
      problems.push(...(await page.evaluate(auditInPage)));

      // Keyboard reachability: a control a keyboard user cannot focus, or can
      // focus without seeing, is unusable.
      const focus = [];
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const s = getComputedStyle(el);
          return { visible: s.outlineStyle !== 'none' || s.boxShadow !== 'none' };
        });
        if (info) focus.push(info);
      }
      if (focus.length === 0) problems.push('nothing reachable by keyboard');
      const invisible = focus.filter((f) => !f.visible).length;
      if (invisible > 0) problems.push(`${invisible} focused element(s) with no visible focus ring`);
    } catch (e) {
      problems.push(`navigation failed: ${e.message.split('\n')[0]}`);
    }

    if (problems.length) {
      failures++;
      console.log(`FAIL ${path}`);
      for (const p of problems) console.log(`       ${p}`);
    } else {
      console.log(`ok   ${path}`);
    }
    await page.close();
  }

  await browser.close();

  if (failures > 0) {
    console.log(`\n${failures} page(s) with accessibility problems`);
    process.exit(1);
  }
  console.log(`\nAll ${PAGES.length} pages pass the automated accessibility checks`);
})().catch((e) => {
  console.error('a11y run failed:', e.message);
  process.exit(1);
});
