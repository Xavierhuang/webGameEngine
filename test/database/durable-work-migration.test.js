const assert = require('assert');
const { readFileSync } = require('fs');
const { resolve } = require('path');

const migration = readFileSync(
  resolve(__dirname, '../../migrations/009_durable_work.sql'),
  'utf8',
);

let passed = 0;
function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`FAIL ${name}\n  ${error.message}`);
    process.exit(1);
  }
  passed++;
  console.log(`ok   ${name}`);
}

function includes(pattern, description) {
  assert.match(migration, pattern, description);
}

// The migration must be idempotent under re-run because setup-db.sh replays
// every unapplied file and the schema_migrations record is only written on
// success — a mid-run failure leaves the file scheduled for another pass.
test('creates every durable-work table with IF NOT EXISTS', () => {
  const tables = [
    'project_commands',
    'editing_sessions',
    'project_play_snapshots',
    'guest_claims',
    'asset_blobs',
    'storage_repair_jobs',
    'deletion_jobs',
    'backup_runs',
  ];
  for (const table of tables) {
    includes(
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'),
      `missing idempotent CREATE for ${table}`,
    );
  }
});

test('adds projects.revision with a safe legacy default', () => {
  includes(
    /table_name = 'projects'[\s\S]*?column_name = 'revision'/i,
    'must probe information_schema before adding projects.revision',
  );
  includes(
    /ALTER TABLE projects ADD COLUMN revision BIGINT UNSIGNED NOT NULL DEFAULT 0/i,
    'projects.revision must be BIGINT UNSIGNED NOT NULL DEFAULT 0',
  );
});

test('project_commands enforces one row per (project, idempotency_key) envelope', () => {
  includes(
    /UNIQUE KEY[^\n]*project_commands[^\n]*\(project_id, idempotency_key\)/i,
    'project_commands needs UNIQUE (project_id, idempotency_key) — retries must be single-writer',
  );
});

test('project_commands stores the canonical-JSON hash of the command body', () => {
  includes(
    /command_sha256 CHAR\(64\) NOT NULL/i,
    'project_commands.command_sha256 must be a 64-char SHA-256 fingerprint',
  );
});

test('project_commands drives the 30-day idempotency purge worker', () => {
  includes(
    /expires_at TIMESTAMP NOT NULL/i,
    'project_commands.expires_at powers the purge worker',
  );
  includes(
    /KEY project_commands_expires \(expires_at\)/i,
    'project_commands needs an index on expires_at so the purge worker scans one column',
  );
});

test('project_commands records the pre- and post-revision for optimistic locking', () => {
  includes(/expected_revision BIGINT UNSIGNED NULL/i, 'expected_revision (If-Match precondition)');
  includes(/applied_revision BIGINT UNSIGNED NULL/i, 'applied_revision (post-commit revision)');
});

test('editing_sessions retains grouped-undo history with a seven-day expiry column', () => {
  includes(/CREATE TABLE IF NOT EXISTS editing_sessions/i, 'missing editing_sessions');
  includes(
    /editing_sessions[\s\S]*?expires_at TIMESTAMP NOT NULL/i,
    'editing_sessions.expires_at (7-day undo history)',
  );
  includes(
    /KEY editing_sessions_expires \(expires_at\)/i,
    'editing_sessions needs the expiry index so the 7-day purge worker is O(scan)',
  );
});

test('project_play_snapshots pins Play to an immutable (project, revision) pair', () => {
  includes(
    /UNIQUE KEY[^\n]*play_snapshots[^\n]*\(project_id, revision\)/i,
    'project_play_snapshots must be uniquely keyed on (project_id, revision)',
  );
  includes(
    /snapshot_sha256 CHAR\(64\) NOT NULL/i,
    'project_play_snapshots.snapshot_sha256 must be SHA-256 of canonical JSON',
  );
});

test('guest_claims makes account claiming single-use per guest profile', () => {
  includes(
    /UNIQUE KEY[^\n]*guest_claims[^\n]*\(guest_profile_id\)/i,
    'guest_claims must be uniquely keyed on guest_profile_id',
  );
  includes(
    /claim_token_hash CHAR\(64\) NOT NULL/i,
    'guest_claims never stores raw tokens — only their SHA-256 hash',
  );
  includes(
    /UNIQUE KEY[^\n]*guest_claims[^\n]*\(claim_token_hash\)/i,
    'guest_claims.claim_token_hash must be unique so a hash lookup is a point read',
  );
});

test('asset_blobs deduplicates by content checksum and refcount', () => {
  includes(
    /CREATE TABLE IF NOT EXISTS asset_blobs \(\s*checksum CHAR\(64\) PRIMARY KEY/i,
    'asset_blobs primary key must be the SHA-256 checksum',
  );
  includes(
    /refcount INT UNSIGNED NOT NULL DEFAULT 0/i,
    'asset_blobs.refcount tracks ownership rows and gates GC',
  );
  includes(
    /UNIQUE KEY[^\n]*asset_blobs[^\n]*\(storage_key\)/i,
    'asset_blobs.storage_key must be UNIQUE — one S3 object per checksum',
  );
});

test('assets expansion adds a blob checksum link without breaking the legacy shape', () => {
  includes(
    /table_name = 'assets'[\s\S]*?column_name = 'blob_checksum'/i,
    'must probe information_schema before adding assets.blob_checksum',
  );
  includes(
    /ADD COLUMN blob_checksum CHAR\(64\) NULL/i,
    'assets.blob_checksum must be nullable so legacy rows survive',
  );
  includes(
    /ADD COLUMN revision_added BIGINT UNSIGNED NULL/i,
    'assets.revision_added records the project revision that added the row',
  );
});

test('deletion_jobs captures blob keys before purging so storage never leaks', () => {
  includes(/CREATE TABLE IF NOT EXISTS deletion_jobs/i, 'missing deletion_jobs');
  includes(
    /status ENUM\('pending','capturing','purging','completed','failed','cancelled'\)/i,
    'deletion_jobs must expose the full state machine so a crashed job can resume',
  );
  includes(
    /captured_blob_keys JSON NULL/i,
    'deletion_jobs.captured_blob_keys is the resume checkpoint',
  );
});

test('backup_runs records the encryption key id, integrity hash, and verified flag', () => {
  includes(/backup_key_id VARCHAR\(128\) NOT NULL/i, 'backup_runs.backup_key_id is REQUIRED');
  includes(/archive_sha256 CHAR\(64\) NOT NULL/i, 'backup_runs.archive_sha256 (integrity)');
  includes(/verified_at TIMESTAMP NULL/i, 'backup_runs.verified_at — never delete the final verified');
  includes(
    /retention_class ENUM\('daily','monthly','manual'\)/i,
    'backup_runs.retention_class distinguishes the 30-daily and 12-monthly tiers',
  );
  includes(
    /KEY backup_runs_verified \(verified_at\)/i,
    'backup_runs needs an index on verified_at so "never delete the last verified" is a point query',
  );
});

test('projects deletion is RESTRICTed until a deletion job captures blob keys', () => {
  // Any FK from a durable-work table back to projects must NOT cascade delete;
  // the deletion job walks blobs first.
  const cascades = migration.match(/REFERENCES projects\(id\) ON DELETE CASCADE/gi) || [];
  assert.equal(
    cascades.length,
    0,
    `no durable-work FK may cascade-delete projects; found ${cascades.length}`,
  );
});

console.log(`\n${passed} passed`);
