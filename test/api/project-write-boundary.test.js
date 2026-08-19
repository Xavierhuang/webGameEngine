/**
 * Write-boundary source guard.
 *
 * Task 3b (this task) introduces the command service as the single writer
 * to `projects`, `scenes`, `game_objects`, `assets`, and `logic_blocks`.
 * Task 4 migrates every existing caller into the command service. Until
 * Task 4 completes, callers listed in `DEFERRED_TO_TASK_4` are a known,
 * documented set of bypasses. Every callsite here should either
 *
 *   (a) live in `lib/projects/commandService.ts`,
 *       `lib/projects/commandHandlers.ts`, or a migration file, OR
 *   (b) be explicitly listed in `DEFERRED_TO_TASK_4` with the reason it
 *       is still a bypass.
 *
 * A new bypass that does not appear in either list fails this test. That
 * is the whole point — it stops a future PR from silently opening a new
 * write path around the command service under the cover of Task 4's
 * larger diff.
 *
 * As Task 4 migrates each caller, delete its entry from the list. When
 * the list is empty the boundary is fully enforced.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');

// Every path is repo-relative. Absolute paths would break the moment the
// repo moved.
const APPROVED_SOURCES = new Set([
  'lib/projects/commandService.ts',
  'lib/projects/commandHandlers.ts',
]);

// Files that still bypass the command service, with a documented reason
// referencing the plan task that will remove them. Any new bypass that
// does not appear here is a test failure.
const DEFERRED_TO_TASK_4 = new Set([
  'app/api/admin/reports/route.ts',
  'app/api/ai/apply-update/route.ts',
  'app/api/game-objects/[id]/logic-blocks/route.ts',
  'app/api/game-objects/[id]/route.ts',
  'app/api/projects/[id]/like/route.ts',
  'app/api/projects/[id]/remix/route.ts',
  'app/api/projects/[id]/route.ts',
  'app/api/projects/import/route.ts',
  'app/api/projects/route.ts',
  'app/api/scenes/[id]/route.ts',
  'app/api/scenes/route.ts',
  'app/api/uploads/audio/route.ts',
  'app/api/uploads/model/route.ts',
  'app/api/uploads/texture/route.ts',
  'app/play/[id]/page.tsx',
  'lib/auth/adminDeletion.ts',
  'lib/auth/reorder.ts',
  'scripts/seed-examples.js',
]);

// Directories to scan. Migrations are excluded because a schema migration
// IS the only correct place for a raw ALTER/CREATE/INSERT against these
// tables. Tests are excluded because their fixtures may seed rows.
const SEARCH_ROOTS = ['app', 'lib', 'scripts'];

// Case-insensitive regex; matches on a single line so a comment stripped by
// the writer's own JSDoc will not trigger. Also matches
// `INSERT INTO projects (`, `UPDATE projects SET`, etc.
const WRITE_STATEMENT = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(projects|scenes|game_objects|assets|logic_blocks)\b/i;

// A block-comment prefix and a line-comment prefix on the exact line count
// as documentation, not code. This is imperfect but good enough — the
// codebase writes SQL as one statement per line and never as a `/* ... */`
// interior.
function isComment(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function collectFiles(dir) {
  const results = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        if (/\.(ts|tsx|js|mjs|cjs)$/i.test(entry.name)) {
          results.push(full);
        }
      }
    }
  }
  return results;
}

function findViolations() {
  const violations = [];
  for (const root of SEARCH_ROOTS) {
    for (const abs of collectFiles(path.join(ROOT, root))) {
      const relative = path.relative(ROOT, abs);
      if (APPROVED_SOURCES.has(relative)) continue;
      let source;
      try {
        source = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      const lines = source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isComment(line)) continue;
        const match = WRITE_STATEMENT.exec(line);
        if (match) {
          violations.push({ file: relative, line: i + 1, table: match[1], text: line.trim() });
          break; // one flag per file is enough — the test's job is presence, not count
        }
      }
    }
  }
  return violations;
}

test('every raw write to protected project tables is either in the command service or on the Task 4 deferred list', () => {
  const violations = findViolations();
  const unexpected = violations.filter((v) => !DEFERRED_TO_TASK_4.has(v.file));
  const missingFromDeferred = [...DEFERRED_TO_TASK_4].filter(
    (path) => !violations.some((v) => v.file === path),
  );

  const errors = [];
  if (unexpected.length > 0) {
    errors.push(
      'New write-boundary bypass introduced — add the file to lib/projects/commandService.ts, ' +
        'lib/projects/commandHandlers.ts, or the Task 4 deferred list with a documented reason:\n' +
        unexpected.map((v) => `  ${v.file}:${v.line} (writes to ${v.table})`).join('\n'),
    );
  }
  if (missingFromDeferred.length > 0) {
    // Task 4 removed a caller — trim the allowlist so it does not rot. If
    // the file was legitimately removed from the repo, drop it from
    // DEFERRED_TO_TASK_4.
    errors.push(
      'Task 4 deferred entries no longer contain write statements — remove them from the allowlist:\n' +
        missingFromDeferred.map((path) => `  ${path}`).join('\n'),
    );
  }

  if (errors.length > 0) {
    assert.fail(errors.join('\n\n'));
  }
});

test('the approved-sources list itself contains write statements — sanity check', () => {
  const violationsInApproved = [];
  for (const source of APPROVED_SOURCES) {
    const abs = path.join(ROOT, source);
    if (!fs.existsSync(abs)) {
      assert.fail(`Approved source ${source} does not exist — the boundary is unenforced`);
    }
    const text = fs.readFileSync(abs, 'utf8');
    if (!WRITE_STATEMENT.test(text)) {
      violationsInApproved.push(source);
    }
  }
  assert.equal(
    violationsInApproved.length,
    0,
    `Approved sources without any write statements are dead placeholders: ${violationsInApproved.join(', ')}`,
  );
});
