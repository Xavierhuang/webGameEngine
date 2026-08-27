/**
 * Every migration runner must strip the database selection.
 *
 * 14 of the 15 migrations open with `USE gameengine;` (001 also with
 * `CREATE DATABASE IF NOT EXISTS gameengine`). Piping one of those into a
 * different database does not fail — it silently applies to `gameengine`
 * instead, and the target stays empty.
 *
 * That quietly defeats the `_test` guard the destructive helpers rely on: a
 * suite that believes it is isolated is writing to the real development
 * database. It also produced a CI failure that read like a broken test suite —
 * 29 failures of "Failed to open the referenced table 'projects'" — when the
 * actual cause was a migration step that had written everything to the wrong
 * database.
 *
 * The migrations themselves are left alone. They are already recorded in
 * `schema_migrations` everywhere they matter, `USE gameengine` is a no-op in
 * production (the database really is called that), and rewriting 14 historical
 * files to fix a runner bug is the wrong repair. What must hold is that every
 * place which *applies* them strips the selection first, so the connection's
 * own database decides. That is what this test pins.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');

const SELECTS_DATABASE = /^\s*(USE\s|CREATE\s+DATABASE\s)/im;

// Every place that pipes a migration file into mysql.
const RUNNERS = [
  '.github/workflows/ci.yml',
  'scripts/setup-db.sh',
  'deploy.sh',
];

/** Matches a `sed` that deletes USE / CREATE DATABASE lines. */
const STRIPS_SELECTION = /sed[^\n|]*USE[^\n|]*CREATE DATABASE/i;

test('the migration set still hardcodes a database, so the runners must strip it', () => {
  // If this ever goes to zero the stripping is no longer load-bearing and this
  // whole file can go. Until then, do not "fix" a migration in isolation and
  // assume the problem is gone.
  const hardcoded = fs
    .readdirSync(path.join(ROOT, 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => SELECTS_DATABASE.test(fs.readFileSync(path.join(ROOT, 'migrations', name), 'utf8')));

  assert.ok(
    hardcoded.length > 0,
    'No migration selects a database any more — delete this test and the sed in every runner.',
  );
});

test('every migration runner strips the database selection before applying', () => {
  const offenders = [];
  for (const runner of RUNNERS) {
    const full = path.join(ROOT, runner);
    if (!fs.existsSync(full)) continue;
    const source = fs.readFileSync(full, 'utf8');
    // Only runners that actually pipe migrations into mysql need the strip.
    const appliesMigrations = /migrations\/\*?\.?s?q?l?|migrations\/\*\.sql/.test(source)
      && /mysql/i.test(source);
    if (!appliesMigrations) continue;
    if (!STRIPS_SELECTION.test(source)) offenders.push(runner);
  }

  assert.deepEqual(
    offenders,
    [],
    'These apply migrations without stripping `USE` / `CREATE DATABASE`, so they will '
    + 'write to `gameengine` no matter which database they were pointed at:\n  '
    + offenders.join('\n  '),
  );
});
