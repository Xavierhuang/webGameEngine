-- Actor-bound, revision-pinned private World Builder play sessions.
USE gameengine;

CREATE TABLE IF NOT EXISTS world_mission_sessions (
  snapshot_id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  actor_profile_id CHAR(36) NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_id),
  KEY idx_world_mission_sessions_project_actor (project_id, actor_profile_id, revision),
  CONSTRAINT fk_world_mission_sessions_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_world_mission_sessions_snapshot
    FOREIGN KEY (snapshot_id) REFERENCES project_play_snapshots(id) ON DELETE CASCADE
);
