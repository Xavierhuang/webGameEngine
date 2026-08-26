const assert = require('assert');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { test } = require('node:test');

const migration = readFileSync(
  resolve(__dirname, '../../migrations/013_world_release_beta.sql'),
  'utf8',
);

function includes(pattern, description) {
  assert.match(migration, pattern, description);
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
    /FOREIGN KEY \(project_play_snapshot_id\) REFERENCES project_play_snapshots\(id\)/i,
    'release snapshot must be a foreign key',
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
