/**
 * A serial, skip-intolerant test gate.
 *
 * Extracted from `scripts/world-release-gate.mjs`, which proved the mechanism
 * and now consumes it. Two rules a plain `node --test` invocation does not
 * give us:
 *
 * 1. **Serial execution.** `node --test` runs files in parallel. The
 *    MySQL-backed suites each apply the full migration set to the same guarded
 *    `_test` database; run concurrently, one loses its `before` hook and skips
 *    its entire suite. Observed for real: 87 tests, 81 passed, 0 failed,
 *    exit 0 — and 6 silently skipped.
 *
 * 2. **A skip is a failure.** `node --test` exits 0 when a suite skips itself,
 *    so an unreachable database turns a gate green while nothing it guards
 *    actually ran. "We didn't check" must never read the same as "we checked
 *    and it was fine."
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

export function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      // A consumer that closes the pipe early (`| head`, a killed parent) must
      // not turn into an EPIPE crash that looks like a gate failure. The
      // captured output is what the verdict is computed from; echoing it is a
      // courtesy.
      try { process.stdout.write(chunk); } catch { /* downstream closed */ }
    });
    process.stdout.on('error', () => {});
    child.stdout.on('error', () => {});
    child.on('close', (code) => resolve({ code, stdout }));
  });
}

/**
 * Reads one summary counter from the test runner's output.
 *
 * Both reporter formats are accepted on purpose. `node --test` picks its
 * default reporter by Node version and by whether stdout is a TTY: Node 24
 * emits the spec reporter's `ℹ pass 100` locally, Node 20 on CI emits TAP's
 * `# pass 100`. Matching only one of those made a gate report "no tests ran"
 * against a run where all 100 passed.
 *
 * Returns null when the counter is absent, which callers treat as an
 * unverifiable run rather than as a zero.
 */
export function summaryCount(output, label) {
  const match = new RegExp(`^(?:ℹ|#) ${label} (\\d+)\\s*$`, 'm').exec(output);
  return match ? Number(match[1]) : null;
}

/**
 * Runs `suites` serially and exits non-zero on failure, on any skip, or on a
 * run whose summary could not be read. Returns the pass count on success.
 */
export async function runGate(name, suites) {
  console.log(`\n=== ${name}: ${suites.length} suites, serial ===\n`);
  const result = await run(process.execPath, ['--test', '--test-concurrency=1', ...suites]);

  const skipped = summaryCount(result.stdout, 'skipped');
  const passed = summaryCount(result.stdout, 'pass');
  const failed = summaryCount(result.stdout, 'fail');

  if (passed === null || failed === null || skipped === null) {
    console.error(
      `\n${name} FAILED: could not read the test summary.\n`
      + 'The runner produced output this gate does not know how to verify, so its\n'
      + 'result cannot be trusted either way. Check the reporter format above.',
    );
    process.exit(1);
  }
  if (result.code !== 0 || failed > 0) {
    console.error(`\n${name} FAILED: ${failed} failing test(s).`);
    process.exit(1);
  }
  if (skipped > 0) {
    console.error(
      `\n${name} FAILED: ${skipped} test(s) skipped.\n`
      + 'A skipped test is not a pass. This usually means MySQL was unreachable or\n'
      + 'a schema was missing, so the behaviour this gate protects was never\n'
      + 'actually checked.',
    );
    process.exit(1);
  }
  if (passed === 0) {
    console.error(`\n${name} FAILED: no tests ran.`);
    process.exit(1);
  }
  return passed;
}
