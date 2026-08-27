/**
 * The browser gate: real-Chromium suites that had no runner.
 *
 * `scripts/smoke.js` loads 12 public pages. It does not sign in, so the block
 * editor, the 3D scene view, the player and the World Builder — the reason the
 * product exists — were never loaded in a browser by CI or by `deploy.sh`.
 * These suites do exercise them and were reachable from no aggregator.
 *
 * Requires a server the caller has already started, passed as argv[2]. That
 * server must be configured as:
 *
 *   MYSQL_DATABASE=gameengine_test   `stranger-write` and friends manipulate
 *                                    rows directly and refuse any database
 *                                    whose name is not exactly that
 *   FEATURE_FLAG_CREATION_AI=true    `stage-panel` sets its fixture up through
 *                                    /api/ai/apply-update, which is behind the
 *                                    flag and 503s under the production default
 *   seeded                           `npm run seed:examples` against the same
 *                                    database, or `examples-play` has nothing
 *                                    to play
 *
 * Each suite asserts on its own and signals by exit code, so this gate judges
 * exit status rather than parsing a test summary.
 *
 *   node scripts/browser-gate.mjs http://localhost:3456
 */

import process from 'node:process';
import { run } from './lib/test-gate.mjs';
import { assertLocalBaseUrl } from '../test/helpers/local-base-url.mjs';

const BASE = assertLocalBaseUrl(process.argv[2] || 'http://localhost:3456');

const SUITES = [
  // Access boundaries, in a real browser rather than by fetch.
  'test/visual/private-project.mjs',
  'test/visual/admin-console.mjs',
  // The creator surfaces smoke.js cannot reach without signing in.
  'test/visual/share-flow.mjs',
  'test/visual/stage-panel.mjs',
  // The gallery actually playing, not merely rendering.
  'test/visual/examples-play.mjs',
  // Pixels. The only check in the repo that looks at rendered output.
  'test/visual/lighting-probe.mjs',
];

/**
 * Known-failing and deliberately not gated yet. Each has a specific diagnosis;
 * none is a mystery, and none should be added here until it passes for the
 * right reason. Recorded in code so the list cannot quietly become "we only
 * ever ran six".
 *
 *   test/api/authorization-matrix.mjs
 *     Predates trust-boundary Task 4. Its ~20 mutating calls send no
 *     `If-Match` / `Idempotency-Key`, so the first PATCH returns 428
 *     precondition_required. Needs each call updated with the preconditions
 *     and its expectations re-derived.
 *
 *   test/visual/stranger-write.mjs
 *     A stranger's write returns 401 where the suite expects 404. One of the
 *     two is wrong about the intended convention (elsewhere the repo answers
 *     404 so an unauthorized caller cannot probe for existence); decide which
 *     before changing either.
 *
 *   test/visual/journey.mjs
 *     Fails at the template editor's expected private-draft graph. The World
 *     Builder Task 3 report already recorded it as blocked on the character
 *     picker having no search field.
 *
 *   test/video/camera-pipeline.mjs
 *     Needs Chromium's synthetic capture device flags; not yet verified here.
 */
const KNOWN_FAILING = 4;

console.log(`\n=== browser gate: ${SUITES.length} suites against ${BASE} ===\n`);

const failures = [];
for (const suite of SUITES) {
  console.log(`\n--- ${suite} ---\n`);
  const result = await run(process.execPath, [suite, BASE]);
  if (result.code !== 0) failures.push(suite);
}

if (failures.length) {
  console.error(`\nbrowser gate FAILED:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}

console.log(
  `\nbrowser gate passed — ${SUITES.length} suites, `
  + `${KNOWN_FAILING} known-failing suites not yet gated (see this file).`,
);
