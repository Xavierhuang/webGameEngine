/**
 * `npm run test:all`: one TypeScript compile, then every pure-logic suite.
 *
 * This used to be a chain of 46 npm scripts joined with `&&`, 39 of which
 * spawned their own `tsc` over overlapping file sets — 45–60 seconds of
 * redundant compilation per run, and 68 distinct compiler command lines to
 * keep in step. The per-suite scripts still exist for running one suite on
 * its own; this file is what CI and `test:all` run.
 *
 * Runs through the same gate as `test:regression`, so the two properties that
 * matter hold here too: suites run serially, and a skipped test fails the
 * run. Plain assertion scripts (most of these) count as one test each; their
 * exit code is the verdict.
 *
 *   node scripts/all-gate.mjs
 */

import process from 'node:process';
import { run, runGate } from './lib/test-gate.mjs';

const SUITES = [
  // The block interpreter and its serializer.
  'test/runtime/interpreter.test.js',
  'test/runtime/demo-parity.headless.js',
  'test/blockly/serializer.test.js',
  'test/blockly/name-field.test.js',
  'test/runtime/new-blocks.test.js',
  'test/runtime/game-outcome.test.js',
  'test/runtime/watcher-format.test.js',
  'test/runtime/palette-coverage.test.js',
  'test/player/scripts-always-run.test.js',
  'test/api/block-order.test.js',

  // Safety and access control.
  'test/safety/rate-limit.test.js',
  'test/safety/keyword-scan.test.js',
  'test/safety/coppa.test.js',
  'test/auth/project-access.test.js',
  'test/auth/public-project-boundary.test.js',
  'test/auth/publication-state.test.js',
  'test/auth/admin-access.test.js',
  'test/api/reorder-contract.test.js',
  'test/api/admin-deletion.test.js',
  'test/api/report-submission.test.js',
  'test/api/trust-boundary-ast.test.js',
  'test/api/trust-boundary-guard.test.js',
  'test/api/admin-guard.test.js',
  'test/visual/security-harness-contract.test.mjs',
  'test/helpers/local-base-url.test.mjs',
  'test/helpers/local-test-database.test.mjs',
  'test/auth/guest-session.test.js',
  'test/auth/actor-policy.test.js',

  // Internationalisation.
  'test/i18n/block-messages.test.js',
  'test/i18n/direction.test.js',
  'test/i18n/messages.test.js',
  'test/i18n/languages.test.js',

  // Monitoring, email, tutorials, content.
  'test/monitoring/errors.test.js',
  'test/email/consent-email.test.js',
  'test/tutorials/catalog.test.js',
  'test/examples/catalog.test.js',
  'test/ai/block-vocabulary.test.js',

  // Models, animation, audio, effects, paint, video.
  'test/models/procedural-animation.test.js',
  'test/models/custom-animation.test.js',
  'test/models/backdrops.test.js',
  'test/audio/music.test.js',
  'test/paint/tools.test.js',
  'test/effects/particles.test.js',
  'test/video/motion.test.js',
  'test/camera/camera-control.test.js',
  'test/utils/model-resource-lifecycle.test.mjs',
  'test/player/gltf-model-instancing.test.js',

  // Editor helpers.
  'test/editor/preview-support.test.js',
  'test/editor/starter-search.test.js',
  'test/editor/lighting.test.mjs',
  'test/editor/shape-preview.test.mjs',
  'test/editor/camera-focus.test.mjs',

  // Prefabs and generated assets.
  'test/prefabs/starter-scale.test.js',
  'test/prefabs/characters.test.js',
  'test/prefabs/minion-assets.test.mjs',
  'test/prefabs/minion-materials.test.mjs',
  'test/tools/metal-starters-generate.test.js',
];

// The dragon suites are their own aggregator (`test:dragon-all`); its members
// compile with flags this single compile does not reproduce, so it stays an
// npm chain rather than a file list.
const NPM_CHAINS = ['test:dragon-all'];

const passed = await runGate('test:all', SUITES);
for (const script of NPM_CHAINS) {
  const result = await run('npm', ['run', script]);
  if (result.code !== 0) {
    console.error(`\ntest:all FAILED: ${script} exited ${result.code}.`);
    process.exit(1);
  }
}
console.log(`\ntest:all passed: ${passed} suite(s) plus ${NPM_CHAINS.join(', ')}.`);
