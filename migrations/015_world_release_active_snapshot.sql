-- Make the release/snapshot uniqueness conditional on a release being live.
--
-- `project_play_snapshots` is UNIQUE on `(project_id, revision)`, so a creator
-- who withdraws a candidate and resubmits the same revision necessarily reuses
-- the same immutable snapshot row. The original unconditional
-- `world_releases_project_snapshot` unique key rejected that ordinary flow with
-- a driver-level duplicate key instead of a typed release error.
--
-- The integrity goal was never "one release per snapshot, forever" — it was
-- "one release may occupy a snapshot at a time". A stored generated column
-- expresses exactly that: live releases key on their snapshot, and terminal or
-- superseded releases collapse to NULL, which MySQL unique indexes permit any
-- number of. History is preserved and the live boundary still fails closed.
--
-- Every statement is guarded so this is a no-op on a schema that already has
-- the final shape and safe to rerun.

USE gameengine;

-- ---------------------------------------------------------------------------
-- The composite foreign keys on `(project_id, project_play_snapshot_id)` are
-- currently indexed by the unique key we are about to drop. Add a plain index
-- over the same prefix first, or InnoDB refuses the drop.
-- ---------------------------------------------------------------------------
SET @world_release_snapshot_ref_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND index_name = 'world_releases_project_snapshot_ref'
);
SET @sql := IF(@world_release_snapshot_ref_idx = 0,
  'ALTER TABLE world_releases ADD KEY world_releases_project_snapshot_ref (project_id, project_play_snapshot_id)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Live releases key on their snapshot; every other status collapses to NULL.
-- Keep this status set identical to `WORLD_RELEASE_LIVE_STATUSES` in
-- `lib/worlds/releaseTypes.ts`.
-- ---------------------------------------------------------------------------
SET @world_release_active_snapshot_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND column_name = 'active_snapshot_id'
);
SET @sql := IF(@world_release_active_snapshot_col = 0,
  'ALTER TABLE world_releases ADD COLUMN active_snapshot_id CHAR(36)
     GENERATED ALWAYS AS (
       CASE WHEN status IN (''submitted'', ''checking'', ''review_pending'', ''published'')
            THEN project_play_snapshot_id
            ELSE NULL
       END
     ) STORED AFTER project_play_snapshot_id',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Add the conditional unique BEFORE dropping the unconditional one. The old
-- key is strictly stronger, so existing rows cannot violate the new key and
-- this cannot fail on a legacy database mid-upgrade.
-- ---------------------------------------------------------------------------
SET @world_release_active_snapshot_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND index_name = 'world_releases_active_snapshot'
);
SET @sql := IF(@world_release_active_snapshot_idx = 0,
  'ALTER TABLE world_releases ADD UNIQUE KEY world_releases_active_snapshot (project_id, active_snapshot_id)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Only now retire the unconditional key.
-- ---------------------------------------------------------------------------
SET @world_release_snapshot_unique := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'world_releases'
    AND index_name = 'world_releases_project_snapshot'
);
SET @sql := IF(@world_release_snapshot_unique > 0,
  'ALTER TABLE world_releases DROP INDEX world_releases_project_snapshot',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
