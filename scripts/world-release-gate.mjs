/**
 * The World Builder release gate.
 *
 * Runs every test that guards an immutable public release, then the end-to-end
 * journey. Two rules that a plain `node --test` invocation does not give us:
 *
 * 1. **Serial execution.** `node --test` runs files in parallel. The MySQL-backed
 *    release suites each apply the full migration set to the same guarded
 *    `_test` database; run concurrently, one loses its `before` hook and skips
 *    its entire suite. That was observed for real during Task 7: 87 tests,
 *    81 passed, 0 failed, exit 0 — and 6 silently skipped.
 *
 * 2. **A skip is a failure.** `node --test` exits 0 when a suite skips itself,
 *    so an unreachable database would turn this gate green while none of the
 *    release-boundary tests ran. For a gate whose entire purpose is to stop
 *    unreviewed content from reaching children, "we didn't check" must never
 *    read the same as "we checked and it was fine."
 *
 *   node scripts/world-release-gate.mjs
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

/**
 * Every path named by Tasks 2–8, enumerated rather than globbed.
 *
 * The plan sketched this as `test/worlds/release-*.test.js`, which silently
 * omits every `.mjs` integration file, the API tests, and the admin UI test.
 * The pre-flight ruling in the SDD ledger requires the explicit list: a future
 * release test that is not added here is a gap, and a gap that reads as a pass
 * is exactly what this gate exists to prevent.
 */
const SUITES = [
  // Task 2 — states, DTOs, transitions
  'test/worlds/release-state.test.js',
  'test/worlds/release-access.test.js',
  // Task 3 — deterministic checks
  'test/worlds/release-checks.test.js',
  'test/worlds/release-checks.integration.mjs',
  // Task 4 — transactional authority
  'test/worlds/release-service.test.js',
  'test/worlds/release-service.integration.mjs',
  // Task 5 — owner and admin APIs
  'test/api/world-release-routes.test.js',
  'test/api/world-release-routes.integration.mjs',
  // Task 6 — public page and remix
  'test/worlds/release-remix.test.js',
  'test/worlds/release-public-boundary.integration.mjs',
  // Task 7 — creator and moderator UI
  'test/worlds/release-panel.test.mjs',
  'test/admin/world-release-queue.test.mjs',
  // Task 8 — discovery and reporting
  'test/worlds/release-discovery.test.js',
  'test/safety/release-report-submission.test.js',
  // Task 9 — cross-cutting regressions
  'test/worlds/release-regression.integration.mjs',
  // Pre-existing boundaries a release change must not regress
  'test/database/world-release-migration.test.js',
  'test/auth/public-project-boundary.test.js',
  'test/api/report-submission.test.js',
];

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      // A consumer that closes the pipe early (`| head`, a killed parent) must
      // not turn into an EPIPE crash that looks like a gate failure. The captured
      // output is what the verdict is computed from; echoing it is a courtesy.
      try { process.stdout.write(chunk); } catch { /* downstream closed */ }
    });
    process.stdout.on('error', () => {});
    child.stdout.on('error', () => {});
    child.on('close', (code) => resolve({ code, stdout }));
  });
}

console.log(`\n=== world release gate: ${SUITES.length} suites, serial ===\n`);
const suiteRun = await run(process.execPath, ['--test', '--test-concurrency=1', ...SUITES]);

const skipped = Number(/^ℹ skipped (\d+)$/m.exec(suiteRun.stdout)?.[1] ?? '0');
const passed = Number(/^ℹ pass (\d+)$/m.exec(suiteRun.stdout)?.[1] ?? '0');
const failed = Number(/^ℹ fail (\d+)$/m.exec(suiteRun.stdout)?.[1] ?? '0');

if (suiteRun.code !== 0 || failed > 0) {
  console.error(`\nworld release gate FAILED: ${failed} failing test(s).`);
  process.exit(1);
}
if (skipped > 0) {
  console.error(
    `\nworld release gate FAILED: ${skipped} test(s) skipped.\n`
    + 'A skipped release-boundary test is not a pass. This usually means MySQL was\n'
    + 'unreachable or the release schema was missing, so the boundaries this gate\n'
    + 'protects were never actually checked.',
  );
  process.exit(1);
}
if (passed === 0) {
  console.error('\nworld release gate FAILED: no tests ran.');
  process.exit(1);
}

console.log(`\n=== world release journey ===\n`);
const journey = await run(process.execPath, ['test/visual/world-release-journey.mjs']);
if (journey.code !== 0) {
  console.error('\nworld release gate FAILED: the end-to-end journey did not complete.');
  process.exit(1);
}

console.log(`\nworld release gate passed — ${passed} tests, 0 skipped, journey complete.`);
