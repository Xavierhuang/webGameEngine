const assert = require('assert');
const { readFileSync } = require('fs');
const { resolve } = require('path');

const migration = readFileSync(resolve(__dirname, '../../migrations/008_trust_boundary.sql'), 'utf8');

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

test('creates every trust-boundary table with its lookup index', () => {
  const tables = [
    ['guest_sessions', 'idx_guest_sessions_profile'],
    ['legacy_guest_quarantine', 'idx_legacy_guest_quarantine_profile'],
    ['consent_tokens', 'idx_consent_tokens_profile'],
    ['rate_limit_buckets', 'idx_rate_limit_buckets_expires'],
    ['security_audit_events', 'idx_security_audit_events_created'],
    ['feature_flags', 'idx_feature_flags_enabled'],
    ['publication_snapshots', 'idx_publication_snapshots_project'],
    ['publication_assets', 'idx_publication_assets_snapshot'],
  ];

  for (const [table, index] of tables) {
    includes(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'), `missing ${table}`);
    includes(new RegExp(`(?:INDEX|KEY) ${index}\\b`, 'i'), `missing ${index}`);
  }
});

test('stores guest and consent authority only as hashes with expiry and revocation', () => {
  includes(/guest_sessions[\s\S]*?profile_id\s+CHAR\(36\)\s+NOT NULL/i, 'guest profile binding');
  includes(/guest_sessions[\s\S]*?token_hash\s+CHAR\(64\)\s+NOT NULL\s+UNIQUE/i, 'guest token hash');
  includes(/guest_sessions[\s\S]*?expires_at\s+TIMESTAMP\s+NOT NULL/i, 'guest expiry');
  includes(/guest_sessions[\s\S]*?revoked_at\s+TIMESTAMP\s+NULL/i, 'guest revocation');
  includes(/consent_tokens[\s\S]*?token_hash\s+CHAR\(64\)\s+NOT NULL\s+UNIQUE/i, 'consent token hash');
  includes(/consent_tokens[\s\S]*?expires_at\s+TIMESTAMP\s+NOT NULL/i, 'consent expiry');
});

test('records durable quota buckets and redacted security audit fields', () => {
  for (const column of ['bucket_key', 'scope', 'subject_hash', 'window_started_at', 'request_count', 'active_count', 'expires_at']) {
    includes(new RegExp(`rate_limit_buckets[\\s\\S]*?${column}\\s+`, 'i'), `rate bucket ${column}`);
  }
  for (const column of ['actor_kind', 'operation', 'outcome', 'reason_code', 'request_id', 'created_at']) {
    includes(new RegExp(`security_audit_events[\\s\\S]*?${column}\\s+`, 'i'), `security audit ${column}`);
  }
  includes(/feature_flags[\s\S]*?flag_key\s+VARCHAR\(100\)\s+PRIMARY KEY/i, 'feature flag key');
  includes(/feature_flags[\s\S]*?enabled\s+BOOLEAN\s+NOT NULL\s+DEFAULT FALSE/i, 'feature flag default');
});

test('expands profiles for guests while retaining deprecated age compatibility', () => {
  includes(/MODIFY COLUMN user_id CHAR\(36\) NULL/i, 'nullable profiles.user_id');
  includes(/profile_kind ENUM\(''user'',\s*''guest''\) NOT NULL DEFAULT ''user''/i, 'profile kind');
  includes(/birth_month CHAR\(7\) NULL/i, 'birth month');
  assert.doesNotMatch(migration, /DROP COLUMN age/i, 'age removal must wait for the contract migration');
});

test('quarantines legacy identities exactly once with a durable completion marker', () => {
  includes(/CREATE TABLE IF NOT EXISTS trust_migration_state\b/i, 'migration state table');
  includes(/INSERT IGNORE INTO legacy_guest_quarantine/i, 'legacy quarantine insert');
  includes(/WHERE NOT EXISTS\s*\(\s*SELECT 1\s*FROM trust_migration_state/i, 'legacy backfill completion guard');
  includes(/INSERT IGNORE INTO trust_migration_state\s*\(migration_key\)/i, 'legacy backfill completion marker');
  includes(/p\.profile_kind\s*=\s*'guest'/i, 'guest profile condition');
  includes(/p\.user_id\s+IS NULL/i, 'missing user condition');
  includes(/u\.email\s+LIKE\s+'guest-%@temp\.local'/i, 'temporary guest email condition');
  includes(/guest-profile-id/i, 'legacy cookie is documented as non-authority');
  assert.ok(
    migration.indexOf('INSERT IGNORE INTO trust_migration_state (migration_key)') >
      migration.indexOf('INSERT IGNORE INTO legacy_guest_quarantine'),
    'the marker must be written only after the legacy backfill completes'
  );
});

test('normalizes nullable project statuses before the final non-null enum', () => {
  includes(/WHERE moderation_status IS NULL\s+OR moderation_status IN \('pending', 'approved'\)/i, 'null status normalization');
  includes(/WHEN visibility = 'public' OR is_published = TRUE THEN 'moderation_pending'/i, 'public null status transition');
  const firstProjectEnum = migration.indexOf('ALTER TABLE projects MODIFY COLUMN moderation_status');
  const finalProjectEnum = migration.lastIndexOf('ALTER TABLE projects MODIFY COLUMN moderation_status');
  assert.ok(firstProjectEnum >= 0 && finalProjectEnum > firstProjectEnum, 'expected interim and final project enums');
  assert.match(migration.slice(firstProjectEnum, finalProjectEnum), /\bNULL DEFAULT 'draft'/i, 'interim enum must remain nullable');
  assert.ok(
    migration.indexOf('UPDATE projects') > firstProjectEnum && migration.indexOf('UPDATE projects') < finalProjectEnum,
    'normalization must run before the final NOT NULL enum'
  );
});

test('keeps public projects pending until immutable snapshots are approved', () => {
  includes(/moderation_pending/i, 'pending publication state');
  includes(/UPDATE projects[\s\S]*?moderation_status[\s\S]*?moderation_pending/i, 'legacy public project reclassification');
  includes(/publication_snapshots[\s\S]*?snapshot_json\s+JSON\s+NOT NULL/i, 'immutable snapshot body');
  includes(/publication_snapshots[\s\S]*?content_hash\s+CHAR\(64\)\s+NOT NULL/i, 'snapshot content hash');
  includes(/publication_assets[\s\S]*?publication_snapshot_id\s+CHAR\(36\)\s+NOT NULL/i, 'snapshot asset binding');
});

test('seeds server capability flags disabled', () => {
  for (const flag of ['ai_project_context', 'ai_mutation', 'personal_media_upload', 'new_publication']) {
    includes(new RegExp(`\\('${flag}', FALSE\\)`, 'i'), `${flag} disabled`);
  }
});

console.log(`\ntrust schema: ${passed} checks passed`);
