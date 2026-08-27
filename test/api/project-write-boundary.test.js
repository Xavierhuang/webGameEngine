/**
 * Write-boundary source guard.
 *
 * The command service is the single writer for graph-edit commands
 * against `projects`, `scenes`, `game_objects`, `assets`, and
 * `logic_blocks`. Every file with a raw write to those tables should
 * either
 *
 *   (a) live in `lib/projects/commandService.ts` or
 *       `lib/projects/commandHandlers.ts`, OR
 *   (b) be explicitly listed in `ALLOWED_BYPASSES` with the reason it
 *       is still a bypass and a pointer to the plan task that will
 *       remove it.
 *
 * A new bypass that does not appear in either list fails this test.
 * That is the whole point — it stops a future PR from silently opening
 * a new write path around the command service.
 *
 * Task 4 migrated the "compat writer" set: routes that mutate a project
 * graph now dispatch through the command service with `If-Match` +
 * `Idempotency-Key`. The remaining entries below are creation-time
 * writers (no prior revision to fence), counter caches, subtree
 * lifecycle (delete/publication), or upload paths owned by later plan
 * tasks. Each entry states its reason so a reviewer can remove or
 * re-classify it as those tasks land.
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

// Documented bypasses. Each entry is `path → reason`. The reason MUST
// name the plan task that will retire the bypass so a reviewer can tell
// whether it is safe to remove.
const ALLOWED_BYPASSES = new Map([
  // Creation-time writers: no prior revision exists to fence against.
  // Wrapped in `withTransaction` for atomicity in Task 4.
  ['app/api/projects/route.ts', 'creation: project + default scene, no prior revision (Task 4 wrapped in txn)'],
  ['app/api/projects/import/route.ts', 'creation: import writes whole subtree, no prior revision (Task 4 wrapped in txn)'],
  ['app/api/projects/[id]/remix/route.ts', 'creation: remix copies whole subtree, no prior revision (Task 4 wrapped in txn)'],
  ['lib/worlds/templateService.ts', 'creation: validated server-owned template materialization, no prior revision (World Builder Task 2)'],

  // Lifecycle writers: delete / publication that are owned by later
  // durable-work / trust-boundary tasks. Wrapped in transactions in
  // Task 4; full pipelines land later.
  ['app/api/projects/[id]/route.ts', 'delete subtree wrapped in txn; full pipeline is durable-work Task 7'],
  ['app/api/admin/reports/route.ts', 'moderation status update wrapped in txn; publication is trust-boundary Task 8'],

  // Counter caches: not part of the mutable project graph the editor
  // sees. Wrapped in `withTransaction` for atomicity in Task 4.
  ['app/api/projects/[id]/like/route.ts', 'counter cache (like_count) recomputed atomically'],

  // Upload paths: Task 6 (S3 asset store) owns the migration to
  // content-addressed blobs.
  ['app/api/uploads/audio/route.ts', 'upload path, migrated by durable-work Task 6 (S3 asset store)'],
  ['app/api/uploads/model/route.ts', 'upload path, migrated by durable-work Task 6 (S3 asset store)'],
  ['app/api/uploads/texture/route.ts', 'upload path, migrated by durable-work Task 6 (S3 asset store)'],

  // Superseded transactional utility still exercised by contract tests.
  // Route now uses `object.reorder` command; the module remains as a
  // legacy helper until its contract test is retired.
  ['lib/auth/reorder.ts', 'legacy helper superseded by object.reorder command; kept for contract test'],

  // Admin subtree deletion — owned by trust-boundary Task 8 (immutable
  // publication + deletion pipeline).
  ['lib/auth/adminDeletion.ts', 'admin subtree deletion, moves to trust-boundary Task 8 pipeline'],

  // Play mode counter increment. Migrating this needs the runtime to
  // hold a snapshot revision; creation-experience task owns it.
  ['app/play/[id]/page.tsx', 'play_count increment, migrated by creation-experience task'],

  // World release beta (2026-08-26). Both of these shipped to production
  // undeclared: this suite is not reachable from `test:all` or
  // `test:critical`, so CI never ran it and the merge went green. They are
  // legitimate on inspection — recorded here rather than "fixed", and the
  // reason each one is a bypass is the same reason the entries above are.
  ['app/worlds/[slug]/page.tsx', 'play_count increment for a published release, same shape and owner as app/play/[id]/page.tsx'],
  ['lib/worlds/releaseRemix.ts', 'creation: materializes an approved immutable snapshot into a new private draft inside one transaction, no prior revision to fence (world-release-beta Task 6)'],

  // Deploy seed: writes are wrapped in a per-example transaction in
  // Task 4; the script must remain able to insert system content.
  ['scripts/seed-examples.js', 'deploy seed; runs before any client exists (Task 4 wrapped each game in a txn)'],
]);

const DEFERRED_TO_TASK_4 = ALLOWED_BYPASSES; // Back-compat alias for any external readers.

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

test('every raw write to protected project tables is either in the command service or on the documented bypass list', () => {
  const violations = findViolations();
  const unexpected = violations.filter((v) => !ALLOWED_BYPASSES.has(v.file));
  const missingFromAllowed = [...ALLOWED_BYPASSES.keys()].filter(
    (path) => !violations.some((v) => v.file === path),
  );

  const errors = [];
  if (unexpected.length > 0) {
    errors.push(
      'New write-boundary bypass introduced — either dispatch the write through the command ' +
        'service or add the file to ALLOWED_BYPASSES with a documented reason and the plan ' +
        'task that will retire it:\n' +
        unexpected.map((v) => `  ${v.file}:${v.line} (writes to ${v.table})`).join('\n'),
    );
  }
  if (missingFromAllowed.length > 0) {
    // A subsequent migration removed a caller — trim the allowlist so it
    // does not rot. If the file was legitimately removed from the repo,
    // drop it from ALLOWED_BYPASSES.
    errors.push(
      'Allowlisted bypasses no longer contain write statements — remove them:\n' +
        missingFromAllowed.map((path) => `  ${path}`).join('\n'),
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
