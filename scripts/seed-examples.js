#!/usr/bin/env node
/**
 * Seeds the example games into the gallery.
 *
 * They are owned by a system account and published, so a child can play them
 * signed out and hit Remix to get their own copy. Remix is the whole community
 * story here, and these give it something worth remixing.
 *
 * Idempotent: each game has a stable id, and re-running replaces that project's
 * scene contents rather than adding a second copy. Safe to run on every deploy.
 *
 * The block content is validated separately by `npm run test:examples`, against
 * the real palette — this script only moves it into the database.
 *
 * Usage: node scripts/seed-examples.js
 */

const crypto = require('crypto');
const mysql = require('mysql2/promise');

const { EXAMPLE_GAMES } = require('../test/.build/lib/examples/catalog');
const { CHARACTER_TEMPLATES } = require('../test/.build/lib/prefabs/characters');

const SYSTEM_EMAIL = 'examples@lingplay.local';
const SYSTEM_USERNAME = 'lingplay';

/** Deterministic uuid from a stable key, so re-seeding updates in place. */
function stableId(key) {
  const h = crypto.createHash('sha256').update(key).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16),
          ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
          h.slice(20, 32)].join('-');
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'gameengine',
    multipleStatements: false,
  });

  try {
    // A system account owns the examples. Created once, never signed into: the
    // password hash is deliberately a value no password can produce.
    const userId = stableId('examples-owner');
    await db.execute(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE email = VALUES(email)`,
      [userId, SYSTEM_EMAIL, 'x-no-login-system-account']
    );
    // profiles.id and profiles.user_id are distinct columns, and `role` is an
    // enum of child/parent/admin — 'admin' is right for an account that owns
    // published examples and can never be signed into.
    /*
     * The profile is created by an `after_user_insert` trigger with an id it
     * generates itself, so inserting one with a chosen id loses on the
     * user_id unique key and the trigger's row is what actually exists.
     * Look it up rather than assume — that mismatch is what made the
     * projects foreign key fail.
     */
    await db.execute(
      `INSERT INTO profiles (id, user_id, username, display_name, role, can_publish, created_at)
       VALUES (?, ?, ?, ?, 'admin', 1, NOW())
       ON DUPLICATE KEY UPDATE
         username = VALUES(username), display_name = VALUES(display_name),
         role = 'admin', can_publish = 1`,
      [stableId('examples-profile'), userId, SYSTEM_USERNAME, 'lingplay examples']
    );
    const [profileRows] = await db.execute(
      `SELECT id FROM profiles WHERE user_id = ? LIMIT 1`, [userId]
    );
    const profileId = profileRows[0]?.id;
    if (!profileId) throw new Error('no profile for the examples account');

    const starters = new Map(CHARACTER_TEMPLATES.map((c) => [c.id, c]));
    let seeded = 0;

    for (const game of EXAMPLE_GAMES) {
      const projectId = stableId(`example:${game.id}`);
      const sceneId = stableId(`example:${game.id}:scene`);

      await db.execute(
        `INSERT INTO projects
           (id, owner_id, title, description, genre, visibility, is_published,
            is_template, moderation_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'example', 'public', 1, 1, 'approved', NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), description = VALUES(description),
           visibility = 'public', is_published = 1, moderation_status = 'approved',
           updated_at = NOW()`,
        // owner_id references profiles(id), not users(id) — the two are
        // separate rows here and mixing them up fails the foreign key.
        [projectId, profileId, game.title, game.description]
      );

      await db.execute(
        `INSERT INTO scenes (id, project_id, name, order_index, created_at)
         VALUES (?, ?, 'Main Scene', 0, NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [sceneId, projectId]
      );

      // Replace the scene's contents so a re-seed cannot accumulate duplicates.
      await db.execute(
        `DELETE FROM logic_blocks WHERE project_id = ?`, [projectId]
      );
      await db.execute(
        `DELETE FROM game_objects WHERE scene_id = ?`, [sceneId]
      );

      let order = 0;
      for (const obj of game.objects) {
        const objectId = stableId(`example:${game.id}:${obj.name}`);
        const starter = obj.starter ? starters.get(obj.starter) : null;
        const properties = starter
          ? {
              shape: 'model',
              model_url: starter.model_url,
              model_bounds: starter.model_bounds,
              model_origin_offset: starter.model_origin_offset,
              size: starter.size,
              color: starter.color,
              characterType: starter.id,
            }
          : { shape: obj.shape || 'box', color: obj.color || '#60A5FA', size: 100 };

        await db.execute(
          `INSERT INTO game_objects
             (id, scene_id, type, name, position_x, position_y, position_z,
              color, properties, order_index, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            objectId, sceneId, obj.type, obj.name,
            obj.position[0], obj.position[1], obj.position[2],
            properties.color || '#60A5FA', JSON.stringify(properties), order++,
          ]
        );

        // Scripts are stored as one row per top-level block, in order — the
        // shape the player already reads.
        let blockOrder = 0;
        for (const block of obj.blocks) {
          await db.execute(
            `INSERT INTO logic_blocks
               (id, game_object_id, project_id, scene_id, block_type, category,
                order_index, block_data, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              stableId(`example:${game.id}:${obj.name}:${blockOrder}`),
              objectId, projectId, sceneId, block.block_type,
              // `category` has no default in the schema. The player never reads
              // it; the editor uses it for grouping.
              'action',
              blockOrder++,
              JSON.stringify({ ...(block.inputs ?? {}), ...(block.children ? { children: block.children } : {}) }),
            ]
          );
        }
      }

      seeded++;
      console.log(`  seeded ${game.title} (${game.objects.length} objects)`);
    }

    console.log(`\n${seeded} example game(s) published to the gallery`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error('seed-examples failed:', e.message);
  process.exit(1);
});
