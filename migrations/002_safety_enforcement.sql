-- Phase 6a: safety enforcement
-- Adds the reports table (community abuse flags) and helpful indices for the
-- moderation moderation_status columns already declared in 001.

USE gameengine;

CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) PRIMARY KEY,
  -- Who filed the report. NULL for anonymous guest reports.
  reporter_profile_id CHAR(36) NULL,
  -- What was reported. Exactly one of these should be set.
  reported_project_id CHAR(36) NULL,
  reported_profile_id CHAR(36) NULL,
  reason ENUM('inappropriate', 'harassment', 'spam', 'violence', 'other') NOT NULL DEFAULT 'other',
  details TEXT,
  status ENUM('open', 'reviewed', 'dismissed', 'actioned') DEFAULT 'open',
  reviewer_id CHAR(36) NULL,
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  FOREIGN KEY (reporter_profile_id) REFERENCES profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (reported_project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (reported_profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_reports_status (status),
  INDEX idx_reports_project (reported_project_id),
  INDEX idx_reports_profile (reported_profile_id),
  INDEX idx_reports_created (created_at)
);

-- The moderation gate uses status to filter public listings. Existing rows
-- default to 'pending' — anything that pre-dates this migration needs manual
-- review before it appears in a public gallery.
ALTER TABLE projects ADD INDEX idx_projects_moderation (moderation_status);
ALTER TABLE projects ADD INDEX idx_projects_visibility (visibility);
