-- Sprite ordering.
--
-- game_objects had no ordering column at all, so the sprite list rendered in
-- whatever order MySQL happened to return and could not be reordered.

USE gameengine;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE table_schema = DATABASE() AND table_name = 'game_objects'
               AND column_name = 'order_index');
SET @sql := IF(@col = 0,
  'ALTER TABLE game_objects ADD COLUMN order_index INT NOT NULL DEFAULT 0',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE table_schema = DATABASE() AND table_name = 'game_objects'
               AND index_name = 'idx_game_objects_order');
SET @sql := IF(@idx = 0,
  'ALTER TABLE game_objects ADD INDEX idx_game_objects_order (scene_id, order_index)',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
