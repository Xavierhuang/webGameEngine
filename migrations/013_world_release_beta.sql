-- Immutable World Builder release records.
--
-- A public release always points at an existing Play snapshot. It never reads
-- mutable project rows as its world content, so reviews, publication, and
-- remix lineage all remain pinned to the exact submitted revision.

USE gameengine;

-- These unique parent identities make the release's composite foreign keys
-- enforce that its snapshot, world template, revision, and hash all belong to
-- the same project. They are redundant with existing primary/unique keys, but
-- InnoDB needs the referenced column order for each composite relationship.
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

CREATE TABLE IF NOT EXISTS world_releases (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  project_play_snapshot_id CHAR(36) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  template_version INT UNSIGNED NOT NULL,
  project_revision BIGINT UNSIGNED NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  status ENUM(
    'submitted', 'checking', 'review_pending', 'published',
    'changes_requested', 'rejected', 'withdrawn', 'taken_down', 'superseded'
  ) NOT NULL DEFAULT 'submitted',
  current_public BOOLEAN NOT NULL DEFAULT FALSE,
  public_slug VARCHAR(80) NULL,
  creator_label VARCHAR(100) NOT NULL,
  decision_reason_code ENUM(
    'automated_check_failed', 'content_policy', 'age_safety', 'copyright',
    'duplicate_submission', 'creator_withdrew', 'administrative_action'
  ) NULL,
  submission_idempotency_key VARCHAR(128) NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_at TIMESTAMP NULL,
  reviewed_at TIMESTAMP NULL,
  published_at TIMESTAMP NULL,
  withdrawn_at TIMESTAMP NULL,
  taken_down_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY world_releases_project_snapshot (project_id, project_play_snapshot_id),
  UNIQUE KEY world_releases_project_submission (project_id, submission_idempotency_key),
  UNIQUE KEY world_releases_public_slug (public_slug),
  KEY idx_world_releases_current_public (current_public, status, published_at),
  KEY idx_world_releases_reviewer (status, submitted_at),
  KEY idx_world_releases_history (project_id, submitted_at),
  CONSTRAINT fk_world_releases_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_world_releases_project_snapshot
    FOREIGN KEY (project_id, project_play_snapshot_id)
    REFERENCES project_play_snapshots(project_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_world_releases_project_template
    FOREIGN KEY (project_id, template_id, template_version)
    REFERENCES project_worlds(project_id, template_id, template_version) ON DELETE RESTRICT,
  CONSTRAINT fk_world_releases_project_snapshot_hash
    FOREIGN KEY (project_id, project_revision, snapshot_sha256)
    REFERENCES project_play_snapshots(project_id, revision, snapshot_sha256) ON DELETE RESTRICT,
  CONSTRAINT fk_world_releases_snapshot_identity
    FOREIGN KEY (project_id, project_play_snapshot_id, project_revision, snapshot_sha256)
    REFERENCES project_play_snapshots(project_id, id, revision, snapshot_sha256) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS world_release_checks (
  id CHAR(36) NOT NULL,
  world_release_id CHAR(36) NOT NULL,
  check_type VARCHAR(64) NOT NULL,
  status ENUM('passed', 'failed', 'error') NOT NULL,
  reason_code ENUM(
    'content_policy', 'age_safety', 'copyright', 'snapshot_integrity',
    'template_validation', 'internal_error',
    'snapshot_hash_mismatch', 'snapshot_revision_mismatch',
    'template_not_active', 'template_invalid', 'template_budget_unavailable',
    'budget_exceeded', 'asset_size_unavailable',
    'asset_url_invalid', 'asset_reference_invalid',
    'block_type_unsupported', 'block_data_invalid',
    'scene_missing', 'player_missing', 'player_controls_missing',
    'metadata_invalid', 'metadata_moderation_failed', 'check_error'
  ) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_world_release_checks_release (world_release_id, created_at),
  KEY idx_world_release_checks_status (status, created_at),
  CONSTRAINT fk_world_release_checks_release
    FOREIGN KEY (world_release_id) REFERENCES world_releases(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS world_release_decisions (
  id CHAR(36) NOT NULL,
  world_release_id CHAR(36) NOT NULL,
  reviewer_profile_id CHAR(36) NULL,
  decision ENUM('approved', 'changes_requested', 'rejected', 'taken_down') NOT NULL,
  reason_code ENUM(
    'approved', 'changes_requested', 'content_policy', 'age_safety',
    'copyright', 'administrative_action'
  ) NULL,
  decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_world_release_decisions_release (world_release_id, decided_at),
  KEY idx_world_release_decisions_reviewer (reviewer_profile_id, decided_at),
  CONSTRAINT fk_world_release_decisions_release
    FOREIGN KEY (world_release_id) REFERENCES world_releases(id) ON DELETE RESTRICT,
  CONSTRAINT fk_world_release_decisions_reviewer
    FOREIGN KEY (reviewer_profile_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS world_release_beta_cohort_members (
  world_release_id CHAR(36) NOT NULL,
  profile_id CHAR(36) NOT NULL,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (world_release_id, profile_id),
  KEY idx_world_release_beta_cohort_profile (profile_id, added_at),
  CONSTRAINT fk_world_release_beta_cohort_release
    FOREIGN KEY (world_release_id) REFERENCES world_releases(id) ON DELETE RESTRICT,
  CONSTRAINT fk_world_release_beta_cohort_profile
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Reports may refer to a release without excluding legacy project/profile
-- reports, so the reference remains nullable and is added idempotently.
SET @world_release_report_column := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'reports'
    AND column_name = 'world_release_id'
);
SET @sql := IF(@world_release_report_column = 0,
  'ALTER TABLE reports ADD COLUMN world_release_id CHAR(36) NULL AFTER reported_project_id',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_report_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE table_schema = DATABASE() AND table_name = 'reports'
    AND constraint_name = 'fk_reports_world_release'
);
SET @sql := IF(@world_release_report_fk = 0,
  'ALTER TABLE reports ADD CONSTRAINT fk_reports_world_release FOREIGN KEY (world_release_id) REFERENCES world_releases(id) ON DELETE SET NULL',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @world_release_report_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'reports'
    AND index_name = 'idx_reports_world_release'
);
SET @sql := IF(@world_release_report_idx = 0,
  'ALTER TABLE reports ADD INDEX idx_reports_world_release (world_release_id)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Remixing a release records immutable origin separately from the older
-- projects.remixed_from pointer. Existing ordinary-project remix/sharing
-- behavior therefore remains unchanged.
SET @source_release_column := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'projects'
    AND column_name = 'source_release_id'
);
SET @sql := IF(@source_release_column = 0,
  'ALTER TABLE projects ADD COLUMN source_release_id CHAR(36) NULL AFTER remixed_from',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @source_release_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE table_schema = DATABASE() AND table_name = 'projects'
    AND constraint_name = 'fk_projects_source_release'
);
SET @sql := IF(@source_release_fk = 0,
  'ALTER TABLE projects ADD CONSTRAINT fk_projects_source_release FOREIGN KEY (source_release_id) REFERENCES world_releases(id) ON DELETE SET NULL',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @source_release_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'projects'
    AND index_name = 'idx_projects_source_release'
);
SET @sql := IF(@source_release_idx = 0,
  'ALTER TABLE projects ADD INDEX idx_projects_source_release (source_release_id)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
