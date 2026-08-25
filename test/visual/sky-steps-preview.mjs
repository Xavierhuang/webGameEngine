/**
 * Focused production-safe journey for the unpersisted Sky Steps preview.
 *
 * It proves the route a child sees in the starter picker: one ordinary jump
 * lands on the first raised platform, then a short walk collects its star.
 * No project is created or saved.
 *
 *   node test/visual/sky-steps-preview.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const baseUrl = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${baseUrl}/worlds/new`, { waitUntil: 'networkidle' });
  console.log('opened picker');
  await page.getByRole('button', { name: 'Preview Sky Steps' }).click();
  console.log('opened preview');
  await page.getByRole('button', { name: 'Start game' }).click();
  console.log('started game');

  const runtime = page.locator('[data-testid="game-runtime-state"]');
  await runtime.waitFor({ timeout: 15_000 });

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.down('Space');
  await page.waitForTimeout(120);
  await page.keyboard.up('Space');
  await page.waitForTimeout(1450);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(250);

  const landing = await runtime.evaluate((element) => ({
    platform: element.getAttribute('data-grounded-platform-name'),
    raised: element.getAttribute('data-on-raised-platform'),
  }));
  if (landing.platform !== 'Sky Step One' || landing.raised !== 'true') {
    throw new Error(`Hero did not land on the first step: ${JSON.stringify(landing)}`);
  }
  console.log('landed on first step');

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="game-runtime-state"]')?.getAttribute('data-collected-star-count') === '1',
    { timeout: 10_000 },
  );

  const result = await runtime.evaluate((element) => ({
    stars: element.getAttribute('data-collected-star-count'),
    visibleStars: element.getAttribute('data-visible-star-names'),
  }));
  if ((result.visibleStars ?? '').includes('Sky Star One')) {
    throw new Error(`Sky Star One stayed visible after collection: ${JSON.stringify(result)}`);
  }

  console.log(`Sky Steps preview passed: landed on ${landing.platform}; Stars ${result.stars}/3.`);
} finally {
  await browser.close();
}
