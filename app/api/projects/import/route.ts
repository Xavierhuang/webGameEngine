import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { withTransaction } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { moderateText, sanitizeUserInput } from '@/lib/safety/moderation';

/**
 * Import a `.lingplay` file exported by GET /api/projects/[id]/export.
 *
 * Every id in the file is remapped to a fresh UUID, so an uploaded file can
 * never overwrite or claim an existing project — it always creates a new one
 * owned by the importer, starting private.
 */
const MAX_SCENES = 50;
const MAX_OBJECTS = 500;
const MAX_BLOCKS = 5000;

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Guest session required' }, { status: 401 });
    }

    const payload = await request.json();

    if (payload?.format !== 'lingplay-project') {
      return NextResponse.json(
        { error: "That doesn't look like a lingplay project file." },
        { status: 400 }
      );
    }

    const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
    const objects = Array.isArray(payload.game_objects) ? payload.game_objects : [];
    const blocks = Array.isArray(payload.logic_blocks) ? payload.logic_blocks : [];

    if (scenes.length > MAX_SCENES || objects.length > MAX_OBJECTS || blocks.length > MAX_BLOCKS) {
      return NextResponse.json({ error: 'That project file is too large to import.' }, { status: 413 });
    }
    if (scenes.length === 0) {
      return NextResponse.json({ error: 'That project file has no scenes.' }, { status: 400 });
    }

    const title = sanitizeUserInput(String(payload.project?.title ?? 'Imported project')).substring(0, 50);
    const description = payload.project?.description
      ? sanitizeUserInput(String(payload.project.description)).substring(0, 500)
      : null;

    // Imported text is user-supplied content like any other, so it goes through
    // the same moderation gate as project create.
    const verdict = await moderateText(
      [title, description].filter(Boolean).join('\n'),
      actor.kind === 'user' ? actor.userId : null,
      actor.kind === 'guest' ? actor.profileId : null
    );
    if (!verdict.safe) {
      return NextResponse.json(
        { error: 'Content moderation failed', reason: verdict.reason },
        { status: 422 }
      );
    }

    const projectId = randomUUID();

    // Wrapped in withTransaction in Task 4: an import writes the whole
    // subtree (project + scenes + objects + blocks) in one shot. A failure
    // mid-write must not leave a half-imported project. Creation-time
    // write, so it stays on the write-boundary allowlist (no prior
    // revision to fence against).
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO projects (id, owner_id, title, description, genre, visibility, moderation_status)
         VALUES (?, ?, ?, ?, ?, 'private', 'draft')`,
        [projectId, actor.profileId, title, description, payload.project?.genre ?? null],
      );

      const sceneIdMap = new Map<string, string>();
      for (const [index, scene] of scenes.entries()) {
        const newId = randomUUID();
        sceneIdMap.set(String(scene.id), newId);
        await connection.execute(
          `INSERT INTO scenes
             (id, project_id, name, order_index, background_color, background_image_url, lighting_preset, physics_enabled, gravity_y)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId,
            projectId,
            sanitizeUserInput(String(scene.name ?? `Scene ${index + 1}`)).substring(0, 255),
            Number(scene.order_index) || index,
            scene.background_color ?? '#87CEEB',
            scene.background_image_url ?? null,
            typeof scene.lighting_preset === 'string' ? scene.lighting_preset.substring(0, 32) : null,
            scene.physics_enabled !== false,
            Number(scene.gravity_y) || 9.8,
          ],
        );
      }

      const objectIdMap = new Map<string, string>();
      for (const obj of objects) {
        const sceneId = sceneIdMap.get(String(obj.scene_id));
        if (!sceneId) continue;
        const newId = randomUUID();
        objectIdMap.set(String(obj.id), newId);
        await connection.execute(
          `INSERT INTO game_objects
             (id, scene_id, type, name, position_x, position_y, position_z, rotation,
              scale_x, scale_y, sprite_url, color, width, height,
              has_physics, is_static, mass, properties)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId,
            sceneId,
            String(obj.type ?? 'sprite').substring(0, 100),
            sanitizeUserInput(String(obj.name ?? 'Object')).substring(0, 255),
            Number(obj.position_x) || 0,
            Number(obj.position_y) || 0,
            Number(obj.position_z) || 0,
            Number(obj.rotation) || 0,
            Number(obj.scale_x) || 1,
            Number(obj.scale_y) || 1,
            obj.sprite_url ?? null,
            obj.color ?? null,
            obj.width ?? null,
            obj.height ?? null,
            Boolean(obj.has_physics),
            Boolean(obj.is_static),
            Number(obj.mass) || 1,
            JSON.stringify(obj.properties ?? {}),
          ],
        );
      }

      for (const block of blocks) {
        const objectId = objectIdMap.get(String(block.game_object_id));
        if (!objectId || !block.block_type) continue;
        await connection.execute(
          `INSERT INTO logic_blocks
             (id, game_object_id, project_id, block_type, category, order_index, block_data)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            objectId,
            projectId,
            String(block.block_type).substring(0, 100),
            String(block.category ?? 'action').substring(0, 100),
            Number(block.order_index) || 0,
            JSON.stringify(block.block_data ?? {}),
          ],
        );
      }
    });

    return NextResponse.json({ project: { id: projectId, title } });
  } catch (error: any) {
    console.error('Error importing project:', error);
    return NextResponse.json({ error: 'Failed to import project' }, { status: 500 });
  }
}
