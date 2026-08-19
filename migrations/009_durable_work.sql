-- Durable work + data lifecycle foundation.
--
-- Every table here is created with `IF NOT EXISTS` and every column addition
-- is guarded by an `information_schema` probe so the migration is fully
-- rerunnable — matches the 001–008 pattern.
--
-- Retention rules baked into columns rather than left to callers:
--   * project_commands.expires_at        — 30 days (idempotency window)
--   * editing_sessions.expires_at        —  7 days (grouped-undo history)
-- Callers set the timestamp; the columns give the expiry worker one index
-- to scan.
--
-- Content-addressed blobs: `asset_blobs` stores one row per unique SHA-256,
-- with a refcount. `assets` holds per-owner ownership rows keyed to a blob
-- checksum. A remix creates a new `assets` row referencing the same blob;
-- deletion decrements the refcount and only tombstones the blob when it
-- reaches zero. That's why nothing here uses ON DELETE CASCADE from
-- `projects` — a deletion job must first walk assets and capture blob keys
-- so storage can be reconciled.

USE gameengine;

-- ---------------------------------------------------------------------------
-- projects.revision — monotonic per-project counter for optimistic locking.
-- Backfilled to 0; new writes increment inside the command transaction.
-- ---------------------------------------------------------------------------
SET @revision_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                      WHERE table_schema = DATABASE() AND table_name = 'projects'
                        AND column_name = 'revision');
SET @sql := IF(@revision_col = 0,
  'ALTER TABLE projects ADD COLUMN revision BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER moderation_status',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- project_commands — one row per client-submitted command.
--
-- (project_id, idempotency_key) is UNIQUE: a retry of the same client
-- envelope returns the stored `result_json` instead of re-executing the
-- command. `command_sha256` is the canonical-JSON hash of the command body,
-- so callers can detect envelope mismatches (same key, different payload).
--
-- expected_revision + applied_revision implement If-Match/optimistic
-- concurrency: commands assert the exact revision they expect to modify and
-- record the revision they produced. `expires_at` drives the 30-day
-- idempotency purge worker.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_commands (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  actor_key VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  command_type VARCHAR(64) NOT NULL,
  command_json JSON NOT NULL,
  command_sha256 CHAR(64) NOT NULL,
  inverse_json JSON NULL,
  result_json JSON NULL,
  expected_revision BIGINT UNSIGNED NULL,
  applied_revision BIGINT UNSIGNED NULL,
  status ENUM('pending','committed','rolled_back','failed') NOT NULL DEFAULT 'pending',
  error_message VARCHAR(1024) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  UNIQUE KEY project_commands_project_idempotency (project_id, idempotency_key),
  KEY project_commands_project_revision (project_id, applied_revision),
  KEY project_commands_expires (expires_at),
  CONSTRAINT project_commands_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- editing_sessions — grouped undo history keyed to a Blockly event group.
--
-- One row per undo-group; `command_ids` lists the constituent project_commands
-- so undo replays inverse operations in reverse order. `expires_at` drives
-- the 7-day undo-history purge worker (matches the plan's global constraint).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS editing_sessions (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  actor_key VARCHAR(128) NOT NULL,
  undo_group_id CHAR(36) NOT NULL,
  command_ids JSON NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  KEY editing_sessions_project_actor (project_id, actor_key, created_at),
  KEY editing_sessions_expires (expires_at),
  UNIQUE KEY editing_sessions_group (project_id, actor_key, undo_group_id),
  CONSTRAINT editing_sessions_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- project_play_snapshots — immutable per-revision snapshots for Play mode.
--
-- Play is revision-pinned: the runtime always loads a snapshot rather than
-- live rows, so a project edit mid-play never mutates a running session.
-- `(project_id, revision)` is UNIQUE — a revision's snapshot is written
-- once and re-read forever. `snapshot_sha256` hashes canonical JSON so
-- external verification (backup restore, integrity audit) can detect drift
-- without re-parsing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_play_snapshots (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  snapshot_json JSON NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY play_snapshots_project_revision (project_id, revision),
  KEY play_snapshots_created (created_at),
  CONSTRAINT play_snapshots_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- guest_claims — atomic guest-to-user account claiming.
--
-- A signed-in user redeems a claim token minted for their prior guest
-- profile; ownership rows on projects/assets/comments transfer inside one
-- transaction. `(guest_profile_id)` is UNIQUE so a guest profile can be
-- claimed at most once. The hash column allows lookup by hashed token
-- without ever storing the raw value.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_claims (
  id CHAR(36) PRIMARY KEY,
  guest_profile_id CHAR(36) NOT NULL,
  claimed_by_user_id CHAR(36) NOT NULL,
  claim_token_hash CHAR(64) NOT NULL,
  status ENUM('pending','claimed','revoked','expired') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  UNIQUE KEY guest_claims_guest (guest_profile_id),
  UNIQUE KEY guest_claims_token_hash (claim_token_hash),
  KEY guest_claims_user (claimed_by_user_id, status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- asset_blobs — immutable content-addressed blobs.
--
-- `checksum` (SHA-256) is the primary key: identical byte content is stored
-- exactly once regardless of how many owners reference it. `refcount` tracks
-- how many `assets` rows point at this blob; a deletion job that decrements
-- refcount to 0 tombstones the row and queues the S3 object for GC.
-- `storage_key` is the S3 object key inside the private assets bucket.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_blobs (
  checksum CHAR(64) PRIMARY KEY,
  storage_key VARCHAR(512) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  content_type VARCHAR(128) NOT NULL,
  refcount INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY asset_blobs_storage_key (storage_key),
  KEY asset_blobs_refcount (refcount)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- assets (expansion) — per-owner ownership rows referencing a blob.
--
-- Adds columns without touching the existing `assets` shape used by
-- pre-durable-work code. `blob_checksum` points into `asset_blobs`;
-- `revision_added` records the project revision at which this ownership row
-- entered the project. Legacy rows without a blob checksum are safe: they
-- retain `file_url` and are migrated to blob storage by Task 6.
-- ---------------------------------------------------------------------------
SET @blob_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                  WHERE table_schema = DATABASE() AND table_name = 'assets'
                    AND column_name = 'blob_checksum');
SET @sql := IF(@blob_col = 0,
  'ALTER TABLE assets ADD COLUMN blob_checksum CHAR(64) NULL AFTER file_url',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @rev_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE table_schema = DATABASE() AND table_name = 'assets'
                   AND column_name = 'revision_added');
SET @sql := IF(@rev_col = 0,
  'ALTER TABLE assets ADD COLUMN revision_added BIGINT UNSIGNED NULL AFTER blob_checksum',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @blob_idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
                  WHERE table_schema = DATABASE() AND table_name = 'assets'
                    AND index_name = 'assets_blob_checksum');
SET @sql := IF(@blob_idx = 0,
  'ALTER TABLE assets ADD KEY assets_blob_checksum (blob_checksum)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- storage_repair_jobs — background reconciliation of blob refcounts and
-- orphaned S3 objects. `next_attempt_at` drives the worker's poll query.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage_repair_jobs (
  id CHAR(36) PRIMARY KEY,
  job_type ENUM('refcount_audit','orphan_sweep','checksum_verify') NOT NULL,
  target_checksum CHAR(64) NULL,
  status ENUM('pending','in_progress','completed','failed') NOT NULL DEFAULT 'pending',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NOT NULL,
  last_error VARCHAR(1024) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  KEY storage_repair_status_next (status, next_attempt_at),
  KEY storage_repair_target (target_checksum)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- deletion_jobs — audited async deletion of projects/accounts.
--
-- No hard cascade delete from `projects` (see FK RESTRICT elsewhere in this
-- file). A deletion job walks assets, captures blob storage keys, decrements
-- blob refcounts, and only then removes project rows. `status` lets the
-- worker report progress; `captured_blob_keys` records what needs GC so a
-- crashed job can resume without leaking storage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deletion_jobs (
  id CHAR(36) PRIMARY KEY,
  subject_type ENUM('project','account') NOT NULL,
  subject_id CHAR(36) NOT NULL,
  requested_by VARCHAR(128) NOT NULL,
  status ENUM('pending','capturing','purging','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  captured_blob_keys JSON NULL,
  error_message VARCHAR(1024) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  KEY deletion_jobs_subject (subject_type, subject_id),
  KEY deletion_jobs_status (status, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- backup_runs — encrypted off-site backup ledger.
--
-- Every backup records the AES-256-GCM key identifier used (`backup_key_id`)
-- plus the SHA-256 of the encrypted archive (`archive_sha256`) so restore can
-- verify integrity before decryption. `retention_class` distinguishes the
-- 30-daily / 12-monthly retention tiers from the plan's global constraints;
-- `verified_at` is set only after a scripted restore of that specific run
-- succeeds — "never delete the final verified backup" queries this column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_runs (
  id CHAR(36) PRIMARY KEY,
  retention_class ENUM('daily','monthly','manual') NOT NULL,
  backup_key_id VARCHAR(128) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  archive_sha256 CHAR(64) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  status ENUM('running','succeeded','failed') NOT NULL DEFAULT 'running',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  verified_at TIMESTAMP NULL,
  error_message VARCHAR(1024) NULL,
  UNIQUE KEY backup_runs_storage_key (storage_key),
  KEY backup_runs_class_started (retention_class, started_at),
  KEY backup_runs_verified (verified_at)
) ENGINE=InnoDB;
