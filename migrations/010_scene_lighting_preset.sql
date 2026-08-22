-- ---------------------------------------------------------------------------
-- 010: Scene lighting preset (server-side persistence).
--
-- Shipped in an earlier commit as a client-only feature (localStorage) so no
-- schema change was required to demo the four vibes. That left a real gap:
-- a friend opening a shared game link got the default lighting because their
-- localStorage was empty. Move the field onto the scenes row so the choice
-- ships with the game.
--
-- ID enum matches lib/scene/lightingPresets.ts::LIGHTING_PRESETS; NULL means
-- "use the default rig" (equivalent to the LIGHTING_PRESETS 'default' entry).
-- Kept optional so existing rows stay untouched — they render exactly as
-- before until the owner explicitly picks a preset.
--
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is MySQL 8.0.29+/MariaDB — the
-- deploy host runs 8.0.35 but developer laptops still ship the shell-bundled
-- 5.7/8.0.<29 in places, and the `IF NOT EXISTS` there is a syntax error
-- rather than a no-op. Every prior migration in this repo (see 003, 008)
-- guards with an information_schema check + PREPARE so re-running the
-- migration stays idempotent everywhere it's ever run.
-- ---------------------------------------------------------------------------

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE table_schema = DATABASE() AND table_name = 'scenes'
               AND column_name = 'lighting_preset');
SET @sql := IF(@col = 0,
  'ALTER TABLE scenes ADD COLUMN lighting_preset VARCHAR(32) NULL DEFAULT NULL AFTER background_image_url',
  'SET @noop = 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
