-- ---------------------------------------------------------------------------
-- 011: Private World Builder identity and mission progress.
--
-- Template catalog rows are versioned server-owned metadata. A project gets
-- exactly one materialized-world identity, which remains private and is
-- independently deletable through the project's existing cascade.
-- ---------------------------------------------------------------------------

USE gameengine;

CREATE TABLE IF NOT EXISTS world_templates (
  template_id VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL,
  catalog_metadata JSON NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (template_id, version),
  INDEX idx_world_templates_active (active, template_id, version)
);

CREATE TABLE IF NOT EXISTS project_worlds (
  project_id CHAR(36) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  template_version INT UNSIGNED NOT NULL,
  world_metadata JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id),
  CONSTRAINT project_worlds_metadata_bounded CHECK (JSON_LENGTH(world_metadata) <= 32),
  CONSTRAINT fk_project_worlds_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_worlds_template
    FOREIGN KEY (template_id, template_version)
    REFERENCES world_templates(template_id, version),
  INDEX idx_project_worlds_template (template_id, template_version)
);

CREATE TABLE IF NOT EXISTS world_mission_progress (
  project_id CHAR(36) NOT NULL,
  mission_id VARCHAR(100) NOT NULL,
  status ENUM('not_started', 'in_progress', 'completed') NOT NULL DEFAULT 'not_started',
  action_evidence JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, mission_id),
  CONSTRAINT world_mission_progress_evidence_bounded
    CHECK (action_evidence IS NULL OR JSON_LENGTH(action_evidence) <= 16),
  CONSTRAINT fk_world_mission_progress_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_world_mission_progress_status (project_id, status)
);
