/**
 * The regression gate: suites that existed but nothing ran.
 *
 * An audit on 2026-08-27 found 40 of 105 `test:*` scripts unreachable from
 * `test:all`, `test:critical` or `test:world-release`. They were written,
 * committed, and then never executed by anything. That is worse than having no
 * test, because the repo reads as covered.
 *
 * What that cost, found the first time these were run:
 *
 *   - `test/api/project-write-boundary.test.js` was failing. The World Builder
 *     release beta shipped to production with two undeclared raw writes to
 *     protected tables. Both were legitimate; neither was reviewed as a bypass.
 *   - `test/worlds/template-service.integration.mjs` had two assertions that had
 *     never passed: one against an object (`Sky Cloud`) that has never existed
 *     in any template, one against an object renamed out from under it weeks
 *     earlier.
 *   - `test/api/consent-flow.mjs` passed 10/10 and then hung forever on an open
 *     pool socket — a suite that, added to CI naively, burns the job timeout
 *     after succeeding.
 *
 * None of those were visible from a green `npm run test:all`.
 *
 * The browser-driven suites (`test:journey`, `test:share-flow`,
 * `test:authorization-matrix`, and the rest of `test/visual/`) are deliberately
 * NOT here: they need a running server and are gated separately in CI after the
 * smoke step. Their absence from this list is a known gap, not an oversight —
 * see RESUME.md.
 *
 *   node scripts/regression-gate.mjs
 */

import process from 'node:process';
import { run, runGate } from './lib/test-gate.mjs';

const SUITES = [
  // Player runtime and presentation — the Sky Steps / platformer work.
  'test/player/platformer-world.test.js',
  'test/player/platformer-motion.test.js',
  'test/player/physics-policy.test.js',
  'test/player/template-coordinate-policy.test.js',
  'test/player/starter-world-presentation.test.js',
  'test/player/jump-hint.test.js',
  'test/player/object-presentation.test.js',
  'test/player/presentation-motion.test.js',
  'test/player/sky-steps-presentation.test.js',
  'test/player/sky-steps-polish.test.js',

  // Audio policy.
  'test/audio/audio-beats.test.js',
  'test/audio/background-beat-policy.test.js',

  // World templates and contracts.
  'test/worlds/sky-steps-template.test.js',
  'test/worlds/sky-steps-contract.test.js',
  'test/worlds/starter-world-polish.test.js',

  // Trust boundary and durable-work schema contracts.
  'test/database/trust-boundary-migration.test.js',
  'test/database/migration-database-selection.test.js',
  'test/database/durable-work-migration.test.js',
  'test/config/security.test.js',
  'test/safety/audit.test.js',
  'test/safety/feature-flags.test.js',
  'test/safety/persistent-limiter.test.js',
  'test/api/capability-flags.test.js',

  // The command service: the single write path for every graph edit.
  'test/mysql/transaction.test.js',
  'test/projects/command-schema.test.js',
  'test/projects/command-service.integration.mjs',
  'test/api/project-write-boundary.test.js',
  'test/api/multi-row-rollback.integration.mjs',

  // World creation and guided missions, against real MySQL.
  'test/worlds/template-service.integration.mjs',
  'test/worlds/mission-service.integration.mjs',

  // The COPPA parental-consent state machine, against real MySQL.
  'test/api/consent-flow.mjs',
];

/**
 * Standalone scripts that assert on their own and signal by exit code.
 *
 * They cannot join the `node --test` list above: they print their own verdict
 * and emit no `pass`/`skipped` summary, so the skip check has nothing to read.
 * Run separately, judged on exit status.
 */
const SCRIPTS = [
  // JSDOM, no browser — the World Builder picker's card accessibility and
  // local-artwork constraints.
  'test/worlds/template-picker.test.mjs',
];

// The app's own pool (lib/mysql/client.ts) defaults to `gameengine` while
// every suite here defaults to `gameengine_test`. Unset locally, the fixture
// rows and the code under test landed in different databases and the consent
// suite failed on a foreign key. CI sets this explicitly; default it here so
// a local run means the same thing.
process.env.MYSQL_DATABASE ??= 'gameengine_test';
if (!process.env.MYSQL_DATABASE.includes('_test')) {
  console.error(`regression gate refuses to run against "${process.env.MYSQL_DATABASE}": the database name must contain _test.`);
  process.exit(1);
}

const passed = await runGate('regression gate', SUITES);

for (const script of SCRIPTS) {
  console.log(`\n=== ${script} ===\n`);
  const result = await run(process.execPath, [script]);
  if (result.code !== 0) {
    console.error(`\nregression gate FAILED: ${script} did not complete.`);
    process.exit(1);
  }
}

console.log(
  `\nregression gate passed — ${passed} tests, 0 skipped, `
  + `${SCRIPTS.length} standalone script(s) complete.`,
);
