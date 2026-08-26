-- Reconcile World Release tables created by the earlier 013 draft.
--
-- The original migration uses CREATE TABLE IF NOT EXISTS, so an installation
-- that already created draft release tables needs explicit ALTERs to converge
-- on the final code-only and composite-identity contract. Every ALTER here is
-- guarded to make this a no-op for fresh final 013 schemas and safe to rerun.

USE gameengine;

-- ---------------------------------------------------------------------------
-- Replace free-text review metadata with finite, kid-safe reason codes.
-- ---------------------------------------------------------------------------
SET @world_release_reason_code_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND column_name = 'decision_reason_code'
);
SET @sql := IF(@world_release_reason_code_col = 0,
  'ALTER TABLE world_releases ADD COLUMN decision_reason_code ENUM(''automated_check_failed'', ''content_policy'', ''age_safety'', ''copyright'', ''duplicate_submission'', ''creator_withdrew'', ''administrative_action'') NULL AFTER creator_label',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_reason_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND column_name = 'decision_reason'
);
SET @sql := IF(@world_release_reason_col > 0,
  'ALTER TABLE world_releases DROP COLUMN decision_reason',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_check_reason_code_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'world_release_checks'
    AND column_name = 'reason_code'
);
SET @sql := IF(@world_release_check_reason_code_col = 0,
  'ALTER TABLE world_release_checks ADD COLUMN reason_code ENUM(''content_policy'', ''age_safety'', ''copyright'', ''snapshot_integrity'', ''template_validation'', ''internal_error'') NULL AFTER status',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_check_details_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'world_release_checks'
    AND column_name = 'details'
);
SET @sql := IF(@world_release_check_details_col > 0,
  'ALTER TABLE world_release_checks DROP COLUMN details',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_decision_reason_code_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'world_release_decisions'
    AND column_name = 'reason_code'
);
SET @sql := IF(@world_release_decision_reason_code_col = 0,
  'ALTER TABLE world_release_decisions ADD COLUMN reason_code ENUM(''approved'', ''changes_requested'', ''content_policy'', ''age_safety'', ''copyright'', ''administrative_action'') NULL AFTER decision',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_decision_reason_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'world_release_decisions'
    AND column_name = 'reason'
);
SET @sql := IF(@world_release_decision_reason_col > 0,
  'ALTER TABLE world_release_decisions DROP COLUMN reason',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Parent composite identities required by the final release foreign keys.
-- ---------------------------------------------------------------------------
SET @world_release_snapshot_project_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'project_play_snapshots'
    AND index_name = 'uq_project_play_snapshots_project_snapshot'
);
SET @sql := IF(@world_release_snapshot_project_idx = 0,
  'ALTER TABLE project_play_snapshots ADD UNIQUE INDEX uq_project_play_snapshots_project_snapshot (project_id, id)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_world_template_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'project_worlds'
    AND index_name = 'uq_project_worlds_project_template'
);
SET @sql := IF(@world_release_world_template_idx = 0,
  'ALTER TABLE project_worlds ADD UNIQUE INDEX uq_project_worlds_project_template (project_id, template_id, template_version)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_snapshot_revision_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'project_play_snapshots'
    AND index_name = 'uq_project_play_snapshots_project_revision_hash'
);
SET @sql := IF(@world_release_snapshot_revision_idx = 0,
  'ALTER TABLE project_play_snapshots ADD UNIQUE INDEX uq_project_play_snapshots_project_revision_hash (project_id, revision, snapshot_sha256)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_snapshot_identity_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'project_play_snapshots'
    AND index_name = 'uq_project_play_snapshots_release_identity'
);
SET @sql := IF(@world_release_snapshot_identity_idx = 0,
  'ALTER TABLE project_play_snapshots ADD UNIQUE INDEX uq_project_play_snapshots_release_identity (project_id, id, revision, snapshot_sha256)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Add each stricter composite FK while the draft FKs still protect existing
-- rows. If legacy data violates a final identity, the failed ADD aborts this
-- migration before any weaker draft FK can be removed. Fresh final schemas
-- already have the final names, so all branches are no-ops there.
-- ---------------------------------------------------------------------------
SET @world_release_project_snapshot_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND constraint_name = 'fk_world_releases_project_snapshot'
);
SET @sql := IF(@world_release_project_snapshot_fk = 0,
  'ALTER TABLE world_releases ADD CONSTRAINT fk_world_releases_project_snapshot FOREIGN KEY (project_id, project_play_snapshot_id) REFERENCES project_play_snapshots(project_id, id) ON DELETE RESTRICT',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_project_template_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND constraint_name = 'fk_world_releases_project_template'
);
SET @sql := IF(@world_release_project_template_fk = 0,
  'ALTER TABLE world_releases ADD CONSTRAINT fk_world_releases_project_template FOREIGN KEY (project_id, template_id, template_version) REFERENCES project_worlds(project_id, template_id, template_version) ON DELETE RESTRICT',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_project_snapshot_hash_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND constraint_name = 'fk_world_releases_project_snapshot_hash'
);
SET @sql := IF(@world_release_project_snapshot_hash_fk = 0,
  'ALTER TABLE world_releases ADD CONSTRAINT fk_world_releases_project_snapshot_hash FOREIGN KEY (project_id, project_revision, snapshot_sha256) REFERENCES project_play_snapshots(project_id, revision, snapshot_sha256) ON DELETE RESTRICT',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_snapshot_identity_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND constraint_name = 'fk_world_releases_snapshot_identity'
);
SET @sql := IF(@world_release_snapshot_identity_fk = 0,
  'ALTER TABLE world_releases ADD CONSTRAINT fk_world_releases_snapshot_identity FOREIGN KEY (project_id, project_play_snapshot_id, project_revision, snapshot_sha256) REFERENCES project_play_snapshots(project_id, id, revision, snapshot_sha256) ON DELETE RESTRICT',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The only superseded FKs are removed after all stricter FKs have succeeded.
SET @draft_release_snapshot_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND constraint_name = 'fk_world_releases_snapshot'
);
SET @sql := IF(@draft_release_snapshot_fk > 0,
  'ALTER TABLE world_releases DROP FOREIGN KEY fk_world_releases_snapshot',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @draft_release_template_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND constraint_name = 'fk_world_releases_template'
);
SET @sql := IF(@draft_release_template_fk > 0,
  'ALTER TABLE world_releases DROP FOREIGN KEY fk_world_releases_template',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
