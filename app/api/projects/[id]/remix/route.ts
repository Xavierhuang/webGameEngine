import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query, queryOne } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectView } from '@/lib/auth/access';

/**
 * Remix (fork) a project.
 *
 * Scratch's defining social mechanic. Deep-copies the whole tree —
 * project → scenes → game_objects → logic_blocks — under the caller's
 * ownership, recording lineage via `projects.remixed_from`.
 *
 * The copy starts private: a remix is yours to change before you decide to
 * share it, and that also keeps unmoderated derivative content out of the
 * gallery until its owner explicitly publishes it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sourceId } = await params;

    // Anyone who can *see* a project can remix it — but they must be
    // identifiable, so we can assign ownership. Guests get a profile minted on
    // first project creation; here we require one to already exist.
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Guest session required' }, { status: 401 });
    }

    const authorized = await requireProjectView(actor, sourceId);
    if (!authorized.access.canRemix) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const source = await queryOne<{
      id: string;
      owner_id: string;
      title: string;
      description: string | null;
      genre: string | null;
      thumbnail_url: string | null;
      visibility: string;
      moderation_status: string;
    }>(
      `SELECT id, owner_id, title, description, genre, thumbnail_url, visibility, moderation_status
       FROM projects WHERE id = ?`,
      [sourceId]
    );

    if (!source) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const newProjectId = randomUUID();
    const remixTitle = `${source.title} (remix)`.substring(0, 255);

    await query(
      `INSERT INTO projects
         (id, owner_id, remixed_from, title, description, genre, thumbnail_url, visibility, moderation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'private', 'draft')`,
      [
        newProjectId,
        actor.profileId,
        source.id,
        remixTitle,
        source.description,
        source.genre,
        source.thumbnail_url,
      ]
    );

    // --- scenes -------------------------------------------------------------
    const scenes = await query<{
      id: string;
      name: string;
      order_index: number;
      background_color: string;
      background_image_url: string | null;
      physics_enabled: boolean | number;
      gravity_y: number;
    }>(
      `SELECT id, name, order_index, background_color, background_image_url, physics_enabled, gravity_y
       FROM scenes WHERE project_id = ? ORDER BY order_index`,
      [sourceId]
    );

    const sceneIdMap = new Map<string, string>();
    for (const scene of scenes) {
      const newSceneId = randomUUID();
      sceneIdMap.set(scene.id, newSceneId);
      await query(
        `INSERT INTO scenes
           (id, project_id, name, order_index, background_color, background_image_url, physics_enabled, gravity_y)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newSceneId,
          newProjectId,
          scene.name,
          scene.order_index,
          scene.background_color,
          scene.background_image_url,
          scene.physics_enabled,
          scene.gravity_y,
        ]
      );
    }

    // --- game objects -------------------------------------------------------
    const objectIdMap = new Map<string, string>();
    if (sceneIdMap.size > 0) {
      const placeholders = Array.from(sceneIdMap.keys()).map(() => '?').join(', ');
      const objects = await query<any>(
        `SELECT * FROM game_objects WHERE scene_id IN (${placeholders})`,
        Array.from(sceneIdMap.keys())
      );

      for (const obj of objects) {
        const newObjectId = randomUUID();
        objectIdMap.set(obj.id, newObjectId);
        await query(
          `INSERT INTO game_objects
             (id, scene_id, type, name, position_x, position_y, position_z, rotation,
              scale_x, scale_y, sprite_url, color, width, height,
              has_physics, is_static, mass, properties)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newObjectId,
            sceneIdMap.get(obj.scene_id),
            obj.type,
            obj.name,
            obj.position_x,
            obj.position_y,
            obj.position_z,
            obj.rotation,
            obj.scale_x,
            obj.scale_y,
            obj.sprite_url,
            obj.color,
            obj.width,
            obj.height,
            obj.has_physics,
            obj.is_static,
            obj.mass,
            typeof obj.properties === 'string' ? obj.properties : JSON.stringify(obj.properties ?? {}),
          ]
        );
      }
    }

    // --- logic blocks -------------------------------------------------------
    // parent_block_id is intentionally not copied: nesting lives inside
    // block_data.children, and that column is unused by the runtime.
    if (objectIdMap.size > 0) {
      const placeholders = Array.from(objectIdMap.keys()).map(() => '?').join(', ');
      const blocks = await query<any>(
        `SELECT * FROM logic_blocks WHERE game_object_id IN (${placeholders}) ORDER BY order_index`,
        Array.from(objectIdMap.keys())
      );

      for (const block of blocks) {
        await query(
          `INSERT INTO logic_blocks
             (id, game_object_id, project_id, scene_id, block_type, category, order_index, block_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            objectIdMap.get(block.game_object_id),
            newProjectId,
            block.scene_id ? sceneIdMap.get(block.scene_id) ?? null : null,
            block.block_type,
            block.category,
            block.order_index,
            typeof block.block_data === 'string' ? block.block_data : JSON.stringify(block.block_data ?? {}),
          ]
        );
      }
    }

    await query('UPDATE projects SET remix_count = remix_count + 1 WHERE id = ?', [sourceId]);

    return NextResponse.json({
      project: { id: newProjectId, title: remixTitle, remixed_from: source.id },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Error remixing project:', error);
    return NextResponse.json({ error: 'Failed to remix project' }, { status: 500 });
  }
}
