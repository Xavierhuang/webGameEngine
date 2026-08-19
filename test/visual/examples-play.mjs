/**
 * Do the public example projects actually play?
 *
 * The examples exist to show a child what is possible, so a broken one is worse
 * than a missing one. Counting them proves nothing: every silent failure in
 * this project so far (platforms never running scripts, invisible particles, a
 * banner on the wrong clock) rendered a perfectly normal-looking page.
 *
 * So this loads each published example, starts it, and looks for the specific
 * thing that game is supposed to put on screen — a variable monitor, a question
 * box — plus any uncaught error. Screenshots are full-page: an element-level
 * screenshot of a WebGL canvas returns a stale buffer.
 *
 *   node test/visual/examples-play.mjs [base-url]
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://play.lingcode.dev';

/**
 * What each example must show once it is running. Keyed by title so a reseed
 * with fresh ids does not break the check.
 */
const EXPECTED = {
  'Coin Rush': { text: 'score', why: 'show variable score' },
  'Asteroid Dodge': { text: 'time survived', why: 'show variable time survived' },
  'Magic Painter': { text: null, why: 'draws with the pen — checked for errors only' },
  'Talking Robot': { text: "What's your name?", why: 'ask and wait' },
  'Parity Showcase': { text: null, why: 'lists and scenes — checked for errors only' },
  'Star Racer': { text: 'rings', why: 'show variable rings' },
  'Maze Escape': { text: 'keys', why: 'show variable keys' },
  'Quiz Master': { text: 'What is 2 + 2?', why: 'ask and wait' },
  // Not the opening message: it is set with a duration and expires, so it is
  // gone by the time a slow page is checked. The beat counter persists.
  'Drum Machine': { text: 'beats played', why: 'the note loop counting' },
  'Bounce Lab': { text: 'speed', why: 'object-scoped variable monitor' },
  'Star Tapper': { text: 'taps', why: 'show variable taps' },
  'Space Defender': { text: 'shot down', why: 'show variable shot down' },
  "The Dragon's Riddle": { text: 'What has keys but opens no locks?', why: 'broadcast then ask' },
};

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const listed = await (await fetch(`${BASE}/api/projects/explore`)).json();
const projects = listed.projects || [];
console.log(`\n${projects.length} published projects on ${BASE}\n`);

let failures = 0;

for (const project of projects) {
  const expect = EXPECTED[project.title] ?? { text: null, why: 'unrecognised example' };
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|DevTools|404/i.test(m.text())) {
      errors.push(m.text().slice(0, 160));
    }
  });

  const problems = [];
  try {
    await page.goto(`${BASE}/play/${project.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 30000 });

    // Click through the start splash, which exists to unlock audio. By its
    // aria-label, not its text: a getByText match lands on an inner <span>,
    // the click does not reach the button's handler, and every game then
    // "fails" while the splash is quietly still up.
    //
    // Clicked in a retry loop: a single click races hydration, and the same
    // game passed one run and failed the next depending on which won. Retrying
    // makes the result about the game rather than about the machine.
    const start = page.getByRole('button', { name: 'Start game' });
    let started = false;
    for (let attempt = 0; attempt < 6 && !started; attempt++) {
      await start.click({ timeout: 10000 }).catch(() => {});
      started = await start
        .waitFor({ state: 'detached', timeout: 3000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!started) problems.push('the start splash never dismissed after 6 clicks');

    // Poll rather than sample once at a fixed moment.
    //
    // A game reaches its first visible moment whenever it gets there — after a
    // broadcast, a wait, two characters' worth of dialogue — and a single
    // sample made the *same* example pass one run and fail the next. That read
    // as flaky games; it was a flaky check.
    if (expect.text) {
      let found = 0;
      for (let i = 0; i < 44 && !found; i++) {
        found = await page.getByText(expect.text, { exact: false }).count();
        if (!found) await page.waitForTimeout(500);
      }
      if (!found) problems.push(`nothing on screen for "${expect.text}" (${expect.why})`);
    } else {
      await page.waitForTimeout(10000);
    }
    if (errors.length) problems.push(`${errors.length} error(s): ${errors[0]}`);

    const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await page.screenshot({ path: `/tmp/example-${slug}.png` });
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }
  await page.close();

  if (problems.length) {
    failures++;
    console.log(`FAIL ${project.title}`);
    for (const p of problems) console.log(`       ${p}`);
  } else {
    console.log(`ok   ${project.title}  (${expect.why})`);
  }
}

await browser.close();
console.log(
  failures ? `\n${failures} of ${projects.length} examples are broken` : `\nall ${projects.length} examples play`
);
process.exit(failures ? 1 : 0);
