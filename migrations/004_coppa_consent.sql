-- Phase 2: COPPA / age gating.
--
-- profiles has carried `age`, `parent_id`, `parental_approval`,
-- `content_filter_level`, `can_share` and `can_publish` since 001, but nothing
-- ever wrote or read them. Signup now collects a date of birth and derives the
-- age band; this migration adds what was missing to actually request and record
-- verifiable parental consent.
--
-- Every statement is guarded so the file is re-runnable.

USE gameengine;

-- The parent's email, captured at signup, before (or without) that parent
-- having an account of their own.
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE table_schema = DATABASE() AND table_name = 'profiles'
               AND column_name = 'parent_email');
SET @sql := IF(@col = 0,
  'ALTER TABLE profiles ADD COLUMN parent_email VARCHAR(255) NULL AFTER parent_id',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- When consent was granted, and by which route. NULL = never granted.
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE table_schema = DATABASE() AND table_name = 'profiles'
               AND column_name = 'parental_approval_at');
SET @sql := IF(@col = 0,
  'ALTER TABLE profiles ADD COLUMN parental_approval_at TIMESTAMP NULL DEFAULT NULL',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Single-use consent tokens. A parent follows the link, confirms, and the
-- child's parental_approval flips. Tokens expire so a stale link can't be
-- replayed months later.
CREATE TABLE IF NOT EXISTS parental_consents (
  id CHAR(36) PRIMARY KEY,
  child_profile_id CHAR(36) NOT NULL,
  parent_email VARCHAR(255) NOT NULL,
  -- Stored as a SHA-256 hash, never the raw token: a database leak must not
  -- hand out working consent links.
  token_hash CHAR(64) NOT NULL UNIQUE,
  status ENUM('pending', 'granted', 'denied', 'expired') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  responded_at TIMESTAMP NULL,
  FOREIGN KEY (child_profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_parental_consents_child (child_profile_id),
  INDEX idx_parental_consents_status (status)
);
