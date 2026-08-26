const assert = require('assert');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { test } = require('node:test');

const migration = readFileSync(
  resolve(__dirname, '../../migrations/013_world_release_beta.sql'),
  'utf8',
);
const databaseTypes = readFileSync(
  resolve(__dirname, '../../lib/database.types.ts'),
  'utf8',
);
const integrityUpgrade = readFileSync(
  resolve(__dirname, '../../migrations/014_world_release_beta_integrity_upgrade.sql'),
  'utf8',
);

function includes(pattern, description) {
  assert.match(migration, pattern, description);
}

function upgradeIncludes(pattern, description) {
  assert.match(integrityUpgrade, pattern, description);
}

test('creates an immutable release pinned to exactly one Play snapshot', () => {
  includes(/CREATE TABLE IF NOT EXISTS world_releases/i, 'missing world_releases');
  includes(/project_play_snapshot_id CHAR\(36\) NOT NULL/i, 'release must pin a Play snapshot');
  includes(
    /UNIQUE KEY world_releases_project_snapshot \(project_id, project_play_snapshot_id\)/i,
    'one immutable release per project snapshot',
  );
  includes(/public_slug VARCHAR\(80\) NULL/i, 'public slugs remain optional until publication');
  includes(
    /submission_idempotency_key VARCHAR\(128\) NOT NULL/i,
    'release submissions need idempotency keys',
  );
  includes(
    /UNIQUE KEY world_releases_project_submission \(project_id, submission_idempotency_key\)/i,
    'one release per project submission envelope',
  );
  includes(
    /status ENUM\(\s*'submitted',\s*'checking',\s*'review_pending',\s*'published',\s*'changes_requested',\s*'rejected',\s*'withdrawn',\s*'taken_down',\s*'superseded'\s*\) NOT NULL/i,
    'release status must use the agreed state names',
  );
  includes(
    /KEY idx_world_releases_current_public \(current_public, status, published_at\)/i,
    'current public release lookup needs an index',
  );
  includes(
    /KEY idx_world_releases_reviewer \(status, submitted_at\)/i,
    'review queue needs an index',
  );
});

test('enforces that a release matches its project world and immutable snapshot identity', () => {
  includes(
    /ADD UNIQUE INDEX uq_project_play_snapshots_project_snapshot \(project_id, id\)/i,
    'snapshots need a project-scoped identity for composite release references',
  );
  includes(
    /ADD UNIQUE INDEX uq_project_worlds_project_template \(project_id, template_id, template_version\)/i,
    'project worlds need a project-scoped template identity',
  );
  includes(
    /ADD UNIQUE INDEX uq_project_play_snapshots_project_revision_hash \(project_id, revision, snapshot_sha256\)/i,
    'snapshots need an immutable project/revision/hash identity',
  );
  includes(
    /ADD UNIQUE INDEX uq_project_play_snapshots_release_identity \(project_id, id, revision, snapshot_sha256\)/i,
    'snapshots need one identity that binds a release id, revision, and hash together',
  );
  includes(
    /FOREIGN KEY \(project_id, project_play_snapshot_id\)\s+REFERENCES project_play_snapshots\(project_id, id\)/i,
    'release snapshot must belong to its release project',
  );
  includes(
    /FOREIGN KEY \(project_id, template_id, template_version\)\s+REFERENCES project_worlds\(project_id, template_id, template_version\)/i,
    'release template must match its release project world',
  );
  includes(
    /FOREIGN KEY \(project_id, project_revision, snapshot_sha256\)\s+REFERENCES project_play_snapshots\(project_id, revision, snapshot_sha256\)/i,
    'release revision and hash must match the immutable project snapshot',
  );
  includes(
    /FOREIGN KEY \(project_id, project_play_snapshot_id, project_revision, snapshot_sha256\)\s+REFERENCES project_play_snapshots\(project_id, id, revision, snapshot_sha256\)/i,
    'release snapshot id, revision, and hash must identify the same immutable snapshot row',
  );
});

test('records release checks, decisions, and beta cohort memberships', () => {
  for (const table of [
    'world_release_checks',
    'world_release_decisions',
    'world_release_beta_cohort_members',
  ]) {
    includes(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'), `missing ${table}`);
  }

  includes(/status ENUM\('passed', 'failed', 'error'\) NOT NULL/i, 'check status union');
  includes(/decision ENUM\('approved', 'changes_requested', 'rejected', 'taken_down'\) NOT NULL/i, 'decision union');
  includes(/FOREIGN KEY \(reviewer_profile_id\) REFERENCES profiles\(id\)/i, 'decision reviewer is linked');
  includes(
    /FOREIGN KEY \(world_release_id\) REFERENCES world_releases\(id\)/i,
    'release records are linked to their immutable release',
  );
});

test('persists release review outcomes as allowlisted codes without raw details', () => {
  assert.doesNotMatch(migration, /decision_reason\s+VARCHAR/i, 'release reason must not store free text');
  assert.doesNotMatch(migration, /details\s+JSON/i, 'checks must not store arbitrary JSON details');
  assert.doesNotMatch(migration, /\breason\s+VARCHAR/i, 'decisions must not store free-text reasons');

  includes(
    /decision_reason_code ENUM\(\s*'automated_check_failed', 'content_policy', 'age_safety', 'copyright',\s*'duplicate_submission', 'creator_withdrew', 'administrative_action'\s*\) NULL/i,
    'release outcomes use allowlisted reason codes',
  );
  includes(
    /reason_code ENUM\(\s*'content_policy', 'age_safety', 'copyright', 'snapshot_integrity',\s*'template_validation', 'internal_error'\s*\) NULL/i,
    'checks use allowlisted reason codes',
  );
  includes(
    /reason_code ENUM\(\s*'approved', 'changes_requested', 'content_policy', 'age_safety',\s*'copyright', 'administrative_action'\s*\) NULL/i,
    'review decisions use allowlisted reason codes',
  );
  assert.match(databaseTypes, /export type WorldReleaseReasonCode =/);
  assert.match(databaseTypes, /export type WorldReleaseCheckReasonCode =/);
  assert.match(databaseTypes, /export type WorldReleaseDecisionReasonCode =/);
});

test('adds only nullable release references to existing mutable records', () => {
  includes(/ADD COLUMN world_release_id CHAR\(36\) NULL/i, 'reports release reference stays optional');
  includes(/FOREIGN KEY \(world_release_id\) REFERENCES world_releases\(id\)/i, 'reports release FK');
  includes(/ADD COLUMN source_release_id CHAR\(36\) NULL/i, 'projects release lineage stays optional');
  includes(
    /FOREIGN KEY \(source_release_id\) REFERENCES world_releases\(id\) ON DELETE SET NULL/i,
    'projects preserve remix lineage through immutable releases',
  );
  includes(
    /ADD INDEX idx_projects_source_release \(source_release_id\)/i,
    'snapshot remix lineage needs a project lookup index',
  );
});

test('upgrades prior draft release tables to code-only review fields', () => {
  for (const [table, rawColumn, codeColumn] of [
    ['world_releases', 'decision_reason', 'decision_reason_code'],
    ['world_release_checks', 'details', 'reason_code'],
    ['world_release_decisions', 'reason', 'reason_code'],
  ]) {
    upgradeIncludes(
      new RegExp(`table_name = '${table}'[\\s\\S]*?column_name = '${codeColumn}'`, 'i'),
      `${table}.${codeColumn} addition must be guarded`,
    );
    upgradeIncludes(
      new RegExp(`table_name = '${table}'[\\s\\S]*?column_name = '${rawColumn}'`, 'i'),
      `${table}.${rawColumn} removal must be guarded`,
    );
    upgradeIncludes(
      new RegExp(`ALTER TABLE ${table} DROP COLUMN ${rawColumn}`, 'i'),
      `${table}.${rawColumn} must be removed`,
    );
  }
  upgradeIncludes(/ADD COLUMN decision_reason_code ENUM\(/i, 'release reason code upgrade');
  upgradeIncludes(/ALTER TABLE world_release_checks ADD COLUMN reason_code ENUM\(/i, 'check reason code upgrade');
  upgradeIncludes(/ALTER TABLE world_release_decisions ADD COLUMN reason_code ENUM\(/i, 'decision reason code upgrade');
});

test('upgrades draft release foreign keys to the immutable composite identities', () => {
  for (const index of [
    'uq_project_play_snapshots_project_snapshot',
    'uq_project_worlds_project_template',
    'uq_project_play_snapshots_project_revision_hash',
    'uq_project_play_snapshots_release_identity',
  ]) {
    upgradeIncludes(new RegExp(`index_name = '${index}'`, 'i'), `${index} must be guarded`);
    upgradeIncludes(new RegExp(`ADD UNIQUE INDEX ${index}\\b`, 'i'), `${index} must be added when absent`);
  }
  for (const legacyForeignKey of [
    'fk_world_releases_snapshot',
    'fk_world_releases_template',
  ]) {
    upgradeIncludes(
      new RegExp(`constraint_name = '${legacyForeignKey}'`, 'i'),
      `${legacyForeignKey} removal must be guarded`,
    );
    upgradeIncludes(
      new RegExp(`DROP FOREIGN KEY ${legacyForeignKey}`, 'i'),
      `${legacyForeignKey} must be removed`,
    );
  }
  for (const foreignKey of [
    'fk_world_releases_project_snapshot',
    'fk_world_releases_project_template',
    'fk_world_releases_project_snapshot_hash',
    'fk_world_releases_snapshot_identity',
  ]) {
    upgradeIncludes(
      new RegExp(`constraint_name = '${foreignKey}'`, 'i'),
      `${foreignKey} must be guarded before creation`,
    );
    upgradeIncludes(new RegExp(`ADD CONSTRAINT ${foreignKey} FOREIGN KEY`, 'i'), `${foreignKey} upgrade`);
  }
  upgradeIncludes(
    /FOREIGN KEY \(project_id, project_play_snapshot_id, project_revision, snapshot_sha256\) REFERENCES project_play_snapshots\(project_id, id, revision, snapshot_sha256\)/i,
    'upgrade must bind snapshot id, revision, and hash to one row',
  );
});

test('keeps draft foreign keys until every stricter composite foreign key is established', () => {
  const finalForeignKeyAdds = [
    'ADD CONSTRAINT fk_world_releases_project_snapshot FOREIGN KEY',
    'ADD CONSTRAINT fk_world_releases_project_template FOREIGN KEY',
    'ADD CONSTRAINT fk_world_releases_project_snapshot_hash FOREIGN KEY',
    'ADD CONSTRAINT fk_world_releases_snapshot_identity FOREIGN KEY',
  ];
  const legacyForeignKeyDrops = [
    'DROP FOREIGN KEY fk_world_releases_snapshot',
    'DROP FOREIGN KEY fk_world_releases_template',
  ];

  const finalAddPositions = finalForeignKeyAdds.map((statement) => integrityUpgrade.indexOf(statement));
  const legacyDropPositions = legacyForeignKeyDrops.map((statement) => integrityUpgrade.indexOf(statement));
  assert.ok(finalAddPositions.every((position) => position >= 0), 'missing final composite FK add');
  assert.ok(legacyDropPositions.every((position) => position >= 0), 'missing guarded draft FK drop');

  const lastFinalAdd = Math.max(...finalAddPositions);
  for (const legacyDropPosition of legacyDropPositions) {
    assert.ok(
      lastFinalAdd < legacyDropPosition,
      'all stricter composite FKs must be added before a draft FK can be removed',
    );
  }
});
