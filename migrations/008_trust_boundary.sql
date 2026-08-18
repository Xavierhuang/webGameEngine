-- Trust-boundary foundation.
--
-- This migration deliberately invalidates every legacy guest identity. The
-- old guest-profile-id cookie is never migrated into an authorization record;
-- legacy rows are retained only for administrator-assisted recovery.

USE gameengine;

-- ---------------------------------------------------------------------------
-- Profiles: a secure guest has a profile but no users row. New code stores
-- only a YYYY-MM birth month and derives the age band on the server. The
-- nullable legacy age column stays until its remaining application consumers
-- are migrated; a later contract migration removes it after deployment.
-- ---------------------------------------------------------------------------
ALTER TABLE profiles MODIFY COLUMN user_id CHAR(36) NULL;

SET @profile_kind_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                          WHERE table_schema = DATABASE() AND table_name = 'profiles'
                            AND column_name = 'profile_kind');
SET @sql := IF(@profile_kind_col = 0,
  'ALTER TABLE profiles ADD COLUMN profile_kind ENUM(''user'', ''guest'') NOT NULL DEFAULT ''user'' AFTER user_id',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @birth_month_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE table_schema = DATABASE() AND table_name = 'profiles'
                           AND column_name = 'birth_month');
SET @sql := IF(@birth_month_col = 0,
  'ALTER TABLE profiles ADD COLUMN birth_month CHAR(7) NULL AFTER profile_kind',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @birth_month_check := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                           WHERE table_schema = DATABASE() AND table_name = 'profiles'
                             AND constraint_name = 'valid_birth_month');
SET @sql := IF(@birth_month_check = 0,
  'ALTER TABLE profiles ADD CONSTRAINT valid_birth_month CHECK (birth_month IS NULL OR birth_month REGEXP ''^[0-9]{4}-(0[1-9]|1[0-2])$'')',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Legacy guest quarantine. These records are explicitly non-authorizing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trust_migration_state (
  migration_key VARCHAR(100) PRIMARY KEY,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS legacy_guest_quarantine (
  id CHAR(36) PRIMARY KEY,
  legacy_profile_id CHAR(36) NOT NULL,
  legacy_user_id CHAR(36) NULL,
  reason ENUM('profile_kind_guest', 'missing_user', 'temporary_guest_email') NOT NULL,
  quarantined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_legacy_guest_quarantine_profile (legacy_profile_id),
  INDEX idx_legacy_guest_quarantine_profile (legacy_profile_id),
  INDEX idx_legacy_guest_quarantine_reason (reason)
);

INSERT IGNORE INTO legacy_guest_quarantine (id, legacy_profile_id, legacy_user_id, reason)
SELECT
  UUID(),
  p.id,
  p.user_id,
  CASE
    WHEN p.profile_kind = 'guest' THEN 'profile_kind_guest'
    WHEN p.user_id IS NULL THEN 'missing_user'
    ELSE 'temporary_guest_email'
  END
FROM profiles p
LEFT JOIN users u ON u.id = p.user_id
WHERE NOT EXISTS (
  SELECT 1
  FROM trust_migration_state
  WHERE migration_key = '008_trust_boundary_legacy_guest_backfill'
)
  AND (
    p.profile_kind = 'guest'
    OR p.user_id IS NULL
    OR u.email LIKE 'guest-%@temp.local'
  );

-- Mark completion only after the full insert succeeds. This remains correct
-- when there were no legacy guests and permits a partial failed run to retry.
INSERT IGNORE INTO trust_migration_state (migration_key)
VALUES ('008_trust_boundary_legacy_guest_backfill');

-- ---------------------------------------------------------------------------
-- Opaque guest sessions. The raw 32-byte base64url token is response-only;
-- storage contains its SHA-256 hash, expiration, and revocation state.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_sessions (
  id CHAR(36) PRIMARY KEY,
  profile_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_guest_sessions_profile (profile_id),
  INDEX idx_guest_sessions_expires (expires_at),
  INDEX idx_guest_sessions_active (profile_id, revoked_at, expires_at)
);

-- Consent links share the same non-reversible, expiring-token pattern.
CREATE TABLE IF NOT EXISTS consent_tokens (
  id CHAR(36) PRIMARY KEY,
  profile_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  purpose ENUM('parental_consent', 'email_verification') NOT NULL DEFAULT 'parental_consent',
  status ENUM('pending', 'granted', 'denied', 'expired') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_consent_tokens_profile (profile_id),
  INDEX idx_consent_tokens_expires (expires_at),
  INDEX idx_consent_tokens_status (status)
);

-- Shared, persistent quota state. bucket_key and subject_hash are SHA-256
-- values so logs and rows do not retain raw addresses or session tokens.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key CHAR(64) PRIMARY KEY,
  scope VARCHAR(100) NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  window_started_at TIMESTAMP NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  active_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_rate_limit_buckets_expires (expires_at),
  INDEX idx_rate_limit_buckets_scope_subject (scope, subject_hash)
);

-- Security logging deliberately excludes prompts, dialogue, email addresses,
-- and raw tokens. Request IDs are correlation handles, not identity proof.
CREATE TABLE IF NOT EXISTS security_audit_events (
  id CHAR(36) PRIMARY KEY,
  actor_kind ENUM('user', 'guest', 'anonymous', 'system') NOT NULL,
  actor_id CHAR(36) NULL,
  operation VARCHAR(100) NOT NULL,
  outcome ENUM('allowed', 'denied', 'error') NOT NULL,
  reason_code VARCHAR(100) NULL,
  request_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_security_audit_events_created (created_at),
  INDEX idx_security_audit_events_actor (actor_kind, actor_id),
  INDEX idx_security_audit_events_operation (operation, outcome)
);

-- Server-only capability flags. High-risk features begin disabled and remain
-- disabled even if a previous environment left a row behind.
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key VARCHAR(100) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_feature_flags_enabled (enabled)
);

INSERT INTO feature_flags (flag_key, enabled) VALUES
  ('ai_project_context', FALSE),
  ('ai_mutation', FALSE),
  ('personal_media_upload', FALSE),
  ('new_publication', FALSE)
ON DUPLICATE KEY UPDATE enabled = FALSE;

-- ---------------------------------------------------------------------------
-- Publication state. Public projects cannot become approved mutable graphs;
-- only a separately stored immutable snapshot can later become published.
-- ---------------------------------------------------------------------------
ALTER TABLE projects MODIFY COLUMN moderation_status
  ENUM('pending', 'approved', 'rejected', 'draft', 'moderation_pending', 'published')
  NULL DEFAULT 'draft';

UPDATE projects
SET moderation_status = CASE
  WHEN visibility = 'public' OR is_published = TRUE THEN 'moderation_pending'
  WHEN moderation_status IS NULL THEN 'draft'
  WHEN moderation_status IN ('pending', 'approved') THEN 'draft'
  ELSE moderation_status
END
WHERE moderation_status IS NULL
   OR moderation_status IN ('pending', 'approved');

ALTER TABLE projects MODIFY COLUMN moderation_status
  ENUM('draft', 'moderation_pending', 'published', 'rejected')
  NOT NULL DEFAULT 'draft';

CREATE TABLE IF NOT EXISTS publication_snapshots (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  snapshot_json JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  moderation_status ENUM('moderation_pending', 'published', 'rejected') NOT NULL DEFAULT 'moderation_pending',
  stale_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moderated_at TIMESTAMP NULL,
  published_at TIMESTAMP NULL,
  UNIQUE KEY unique_publication_snapshots_content (project_id, content_hash),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_publication_snapshots_project (project_id),
  INDEX idx_publication_snapshots_visible (project_id, moderation_status, stale_at)
);

CREATE TABLE IF NOT EXISTS publication_assets (
  id CHAR(36) PRIMARY KEY,
  publication_snapshot_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NULL,
  content_hash CHAR(64) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_snapshot_id) REFERENCES publication_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  INDEX idx_publication_assets_snapshot (publication_snapshot_id),
  INDEX idx_publication_assets_content (content_hash)
);
