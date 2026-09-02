-- ---------------------------------------------------------------------------
-- 016: Gallery search index + per-account tutorial progress.
--
-- Search: /explore built `title LIKE '%term%' OR description LIKE '%term%'`,
-- which a leading wildcard turns into a full scan of `projects` with two
-- joins on every keystroke. A FULLTEXT index with the ngram parser handles
-- English and CJK titles alike (the default parser cannot split Chinese).
-- `lib/auth/publicProjects.ts` uses MATCH ... AGAINST for terms of two or
-- more characters and falls back to LIKE below that, because ngram tokens
-- are two characters long.
--
-- Tutorial progress lived only in localStorage, so a child on a shared
-- classroom machine or a second device started every tutorial from step one.
-- One row per profile per tutorial; guests have profiles too, so it works
-- before an account exists and survives claiming.
--
-- No `USE` line: every runner names the database on the connection. See
-- test/database/migration-database-selection.test.js.
-- ---------------------------------------------------------------------------

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE table_schema = DATABASE() AND table_name = 'projects'
               AND index_name = 'idx_projects_search');
SET @sql := IF(@idx = 0,
  'ALTER TABLE projects ADD FULLTEXT INDEX idx_projects_search (title, description) WITH PARSER ngram',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS tutorial_progress (
  profile_id CHAR(36) NOT NULL,
  tutorial_id VARCHAR(64) NOT NULL,
  -- Zero-based index of the furthest step reached.
  step INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id, tutorial_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
