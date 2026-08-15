/**
 * Renders real starter models in a real browser and measures whether they are
 * actually visible against the viewport background.
 *
 * Everything else in this repo checks source or logic. Nothing could see that
 * the Animation Editor was drawing a character no one could make out — the
 * component mounted, the GLB parsed, all 16 bones enumerated, nothing threw.
 * It took a person opening the editor and asking "why can't I see anything?"
 *
 * This is the one check that looks at pixels.
 *
 * It is deliberately NOT part of `test:all`: it needs Playwright, a static
 * server, and about ten seconds. Run it when touching lighting, materials, or
 * the starter generator.
 *
 *   npm run test:visual
 *
 * Caveat worth knowing: CI and this script render through SwiftShader
 * (software GL), which is not pixel-identical to a real GPU. It is reliable
 * for relative comparisons — rig A versus rig B — which is what it is for.
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import assert from 'node:assert';

/**
 * The rig the app actually ships, read from source rather than copied here.
 * A duplicated constant is precisely the failure this probe exists to catch,
 * so duplicating it inside the probe would be self-defeating: someone could
 * dim the app to black and this would still report everything fine.
 */
function shippedRig() {
  const src = readFileSync('lib/constants/game.ts', 'utf8');
  const num = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*([\\d.]+)`));
    assert.ok(m, `${key} missing from LIGHTING — has the rig been renamed?`);
    return parseFloat(m[1]);
  };
  const vec = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`));
    assert.ok(m, `${key} missing from LIGHTING`);
    return m[1].split(',').map((n) => parseFloat(n));
  };
  return {
    ambient: num('AMBIENT_INTENSITY'),
    point: [vec('POINT_LIGHT_POSITION'), num('POINT_LIGHT_INTENSITY')],
    dir1: [vec('DIRECTIONAL_LIGHT_1_POSITION'), num('DIRECTIONAL_LIGHT_1_INTENSITY')],
    dir2: [vec('DIRECTIONAL_LIGHT_2_POSITION'), num('DIRECTIONAL_LIGHT_2_INTENSITY')],
    hemi: num('HEMISPHERE_LIGHT_INTENSITY'),
  };
}

const RIG = shippedRig();
const TOTAL = RIG.ambient + RIG.point[1] + RIG.dir1[1] + RIG.dir2[1] + RIG.hemi;

/**
 * The rig the Animation Editor shipped with when it was reported unviewable:
 * ambient 1.2 was 0.6, and there was no second directional or hemisphere.
 * Used as the control every model is compared against.
 */
const REPORTED_DIM = {
  ambient: 0.6,
  point: [[-5, 5, -5], 0.5],
  dir1: [[5, 10, 5], 0.8],
  dir2: [[0, 0, 0], 0],
  hemi: 0,
};

const PORT = 8899;
const MODELS = [
  'hero',      // metal 0.15-0.85, the one that was reported
  'robot',     // heavy metal
  'astronaut',
  'alien',
];

const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
  stdio: 'ignore',
  detached: true,
});

const stop = () => {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
};
process.on('exit', stop);

let failures = 0;

try {
  await new Promise((r) => setTimeout(r, 1500));

  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.goto(`http://localhost:${PORT}/test/visual/lighting-probe.html`, {
    waitUntil: 'load',
  });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  assert.deepStrictEqual(errors, [], `probe page errored: ${errors.join('; ')}`);

  // Each model is measured under both rigs. Comparing a model against itself
  // is the honest test here: absolute thresholds punish legitimate art. The
  // first version of this script asserted that 95% of a model's pixels must
  // differ from the background, and failed the astronaut — whose mean
  // luminance is the highest of any starter, and whose "invisible" pixels are
  // a deliberately dark helmet visor. Meanwhile a genuinely too-dim hero
  // scored 78.7% against the astronaut's 84.9%, so the metric barely
  // separated a real fault from a false one.
  //
  // Contrast against the background, model by model, does separate them.
  console.log(`shipped rig total intensity: ${TOTAL.toFixed(2)} (read from lib/constants/game.ts)`);
  console.log(`control rig (as reported):   ${(0.6 + 0.5 + 0.8).toFixed(2)}\n`);
  console.log('model       dimLum  shippedLum  gain   bg    coverage');

  for (const name of MODELS) {
    const url = `/public/models/starters/${name}.glb`;
    const lit = await page.evaluate(([u, r]) => window.probe(u, r), [url, RIG]);
    const dim = await page.evaluate(([u, r]) => window.probe(u, r), [url, REPORTED_DIM]);

    const gain = dim.meanLuminance ? lit.meanLuminance / dim.meanLuminance : 0;
    const contrast = lit.bgLuminance ? lit.meanLuminance / lit.bgLuminance : 0;

    console.log(
      name.padEnd(11),
      String(dim.meanLuminance).padEnd(7),
      String(lit.meanLuminance).padEnd(11),
      `${gain.toFixed(2)}x`.padEnd(6),
      String(lit.bgLuminance).padEnd(5),
      lit.coverage
    );

    const problems = [];
    // The model must be in frame at all. Catches broken framing or scale even
    // when lighting is fine.
    if (lit.coverage < 0.02)
      problems.push(`only ${(lit.coverage * 100).toFixed(1)}% of the viewport — is it in frame?`);
    // Contrast against the background is the thing that decides whether a
    // child can see their character. Measured under the shipped rig: robot
    // 3.1x (the darkest starter), hero 4.8x, alien 5.7x, astronaut 6.5x.
    // Under the dim rig robot fell to 1.7x. 2.5 sits between them.
    //
    // Note the `gain` column is reported but NOT asserted on. It ranges
    // 1.45-1.88x depending on how bright the model's own materials are, which
    // makes it useless as a pass/fail line — an early version of this script
    // asserted on it and failed the astronaut and alien, both of which are
    // perfectly visible. Reported because it is informative; not asserted
    // because it does not discriminate.
    if (contrast < 2.5)
      problems.push(
        `only ${contrast.toFixed(1)}x the background luminance — a child would struggle to see it`
      );

    if (problems.length) {
      failures++;
      console.log(`  FAIL ${name}: ${problems.join('; ')}`);
    }
  }

  // The metric must be capable of failing, or this script is decoration.
  // The darkest starter under the rig that shipped when the viewport was
  // reported empty should fall below the threshold.
  const control = await page.evaluate(
    ([u, r]) => window.probe(u, r),
    ['/public/models/starters/robot.glb', REPORTED_DIM]
  );
  const controlContrast = control.meanLuminance / control.bgLuminance;
  console.log(`\ncontrol: robot under the dim rig -> ${controlContrast.toFixed(1)}x background`);
  assert.ok(
    controlContrast < 2.5,
    `the control scored ${controlContrast.toFixed(1)}x, above the failure threshold — ` +
      'this probe can no longer distinguish a dim rig from a lit one, so it proves nothing'
  );

  await browser.close();
} finally {
  stop();
}

if (failures) {
  console.log(`\n${failures} model(s) render poorly against the viewport background`);
  process.exit(1);
}
console.log(`\nAll ${MODELS.length} models render clearly under the shipped rig`);
