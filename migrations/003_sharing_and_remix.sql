-- Phase 1: sharing + remix.
--
-- Scratch's defining social mechanic is remix, and the schema had no way to
-- express it: no lineage column, and `like_count` was a bare counter with no
-- record of who liked what (so likes could not be toggled or de-duplicated).
--
-- Every statement here is guarded so the file is re-runnable — scripts/setup-db.sh
-- applies all migrations on every invocation.

USE gameengine;

-- ---------------------------------------------------------------------------
-- Remix lineage
-- ---------------------------------------------------------------------------
-- remixed_from points at the immediate parent. ON DELETE SET NULL keeps a remix
-- alive when its parent is deleted (Scratch does the same — the chain breaks,
-- the project survives).
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE table_schema = DATABASE() AND table_name = 'projects'
               AND column_name = 'remixed_from');
SET @sql := IF(@col = 0,
  'ALTER TABLE projects ADD COLUMN remixed_from CHAR(36) NULL AFTER owner_id',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE table_schema = DATABASE() AND table_name = 'projects'
               AND column_name = 'remix_count');
SET @sql := IF(@col = 0,
  'ALTER TABLE projects ADD COLUMN remix_count INT NOT NULL DEFAULT 0',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE table_schema = DATABASE() AND table_name = 'projects'
              AND constraint_name = 'fk_projects_remixed_from');
SET @sql := IF(@fk = 0,
  'ALTER TABLE projects ADD CONSTRAINT fk_projects_remixed_from
     FOREIGN KEY (remixed_from) REFERENCES projects(id) ON DELETE SET NULL',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE table_schema = DATABASE() AND table_name = 'projects'
               AND index_name = 'idx_projects_remixed_from');
SET @sql := IF(@idx = 0,
  'ALTER TABLE projects ADD INDEX idx_projects_remixed_from (remixed_from)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Gallery ordering: "newest public projects" and "most loved".
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE table_schema = DATABASE() AND table_name = 'projects'
               AND index_name = 'idx_projects_gallery');
SET @sql := IF(@idx = 0,
  'ALTER TABLE projects ADD INDEX idx_projects_gallery (visibility, moderation_status, created_at)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Likes ("love-its")
-- ---------------------------------------------------------------------------
-- The join table is the source of truth; projects.like_count is a denormalised
-- cache kept in step by the API. The composite PK makes double-liking a no-op.
CREATE TABLE IF NOT EXISTS project_likes (
  project_id CHAR(36) NOT NULL,
  profile_id CHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, profile_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_project_likes_profile (profile_id)
);
