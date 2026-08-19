import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, withTransaction } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectEdit, requireProjectView } from '@/lib/auth/access';
import { moderateText, sanitizeUserInput } from '@/lib/safety/moderation';
import { dispatchCompatCommand, toCommandActor } from '@/lib/projects/commandRouteHelper';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    await requireProjectView(actor, id);

    // Fetch project (allow guests to access their own projects)
    const project = await queryOne<{
      id: string;
      owner_id: string;
      title: string;
      description: string | null;
      thumbnail_url: string | null;
      is_published: boolean;
      is_template: boolean;
      visibility: string;
      genre: string | null;
      created_at: Date;
      updated_at: Date;
      last_played_at: Date | null;
      play_count: number;
      like_count: number;
      moderation_status: string;
      moderation_notes: string | null;
      revision: number | string;
    }>('SELECT * FROM projects WHERE id = ?', [id]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch scenes
    const scenes = await query<{
      id: string;
      project_id: string;
      name: string;
      order_index: number;
      background_color: string;
      background_image_url: string | null;
      physics_enabled: boolean;
      gravity_y: number;
      created_at: Date;
      updated_at: Date;
    }>('SELECT * FROM scenes WHERE project_id = ? ORDER BY order_index', [id]);

    // Fetch game objects for each scene
    const sceneIds = scenes.map((s) => s.id);
    const gameObjects = sceneIds.length > 0
      ? await query<{
          id: string;
          scene_id: string;
          type: string;
          name: string;
          position_x: number;
          position_y: number;
          position_z: number;
          rotation: number;
          scale_x: number;
          scale_y: number;
          sprite_url: string | null;
          color: string | null;
          width: number | null;
          height: number | null;
          has_physics: boolean;
          is_static: boolean;
          mass: number;
          properties: any;
          created_at: Date;
          updated_at: Date;
        }>(
          `SELECT * FROM game_objects WHERE scene_id IN (${sceneIds.map(() => '?').join(',')}) ORDER BY order_index, created_at`,
          sceneIds
        )
      : [];

    // Fetch logic blocks for game objects
    const gameObjectIds = gameObjects.map((go) => go.id);
    const logicBlocks = gameObjectIds.length > 0
      ? await query<{
          id: string;
          game_object_id: string | null;
          project_id: string | null;
          scene_id: string | null;
          block_type: string;
          category: string;
          parent_block_id: string | null;
          order_index: number;
          block_data: any;
          created_at: Date;
          updated_at: Date;
        }>(
          // ORDER BY is load-bearing, not tidiness. A script is a flat ordered
          // array — a hat block owns the blocks that follow it — so unordered
          // rows are a shuffled program. MySQL returned them in roughly primary
          // key order, which for a UUID key is arbitrary, so every published
          // game and every project opened in the editor ran its blocks in a
          // random order. It looked like a working game that behaved oddly.
          `SELECT * FROM logic_blocks WHERE game_object_id IN (${gameObjectIds.map(() => '?').join(',')})
           ORDER BY game_object_id, order_index`,
          gameObjectIds
        )
      : [];

    // Fetch assets
    const assets = await query<{
      id: string;
      project_id: string | null;
      owner_id: string;
      asset_type: string;
      name: string;
      file_url: string;
      file_size: number | null;
      mime_type: string | null;
      frame_width: number | null;
      frame_height: number | null;
      frame_count: number | null;
      generated_by_ai: boolean;
      generation_prompt: string | null;
      moderation_status: string;
      created_at: Date;
    }>('SELECT * FROM assets WHERE project_id = ?', [id]);

    // Structure the response with nested relations (mirrors what a single Supabase select-with-joins used to return)
    const projectWithRelations = {
      id: project.id,
      title: project.title,
      description: project.description,
      thumbnail_url: project.thumbnail_url,
      is_published: project.is_published,
      is_template: project.is_template,
      visibility: project.visibility,
      genre: project.genre,
      created_at: project.created_at,
      updated_at: project.updated_at,
      last_played_at: project.last_played_at,
      play_count: project.play_count,
      like_count: project.like_count,
      moderation_status: project.moderation_status,
      revision: Number(project.revision),
      scenes: scenes.map((scene) => ({
        id: scene.id,
        name: scene.name,
        order_index: scene.order_index,
        background_color: scene.background_color,
        background_image_url: scene.background_image_url,
        physics_enabled: scene.physics_enabled,
        gravity_y: scene.gravity_y,
        game_objects: gameObjects
          .filter((go) => go.scene_id === scene.id)
          .map((go) => ({
            id: go.id,
            scene_id: go.scene_id,
            type: go.type,
            name: go.name,
            position_x: go.position_x,
            position_y: go.position_y,
            position_z: go.position_z,
            rotation: go.rotation,
            scale_x: go.scale_x,
            scale_y: go.scale_y,
            sprite_url: go.sprite_url,
            color: go.color,
            width: go.width,
            height: go.height,
            has_physics: go.has_physics,
            is_static: go.is_static,
            mass: go.mass,
            properties: go.properties,
            logic_blocks: logicBlocks.filter(
              (lb) => lb.game_object_id === go.id
            ).map((lb) => ({
              id: lb.id,
              game_object_id: lb.game_object_id,
              block_type: lb.block_type,
              category: lb.category,
              parent_block_id: lb.parent_block_id,
              order_index: lb.order_index,
              block_data: lb.block_data,
            })),
          })),
      })),
      assets: assets.map((asset) => ({
        id: asset.id,
        asset_type: asset.asset_type,
        name: asset.name,
        file_url: asset.file_url,
        file_size: asset.file_size,
        mime_type: asset.mime_type,
        frame_width: asset.frame_width,
        frame_height: asset.frame_height,
        frame_count: asset.frame_count,
        generated_by_ai: asset.generated_by_ai,
      })),
    };

    return NextResponse.json({ project: projectWithRelations });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

/**
 * PATCH migrated in Task 4.
 *
 * Metadata updates (title/description/thumbnail_url/genre/visibility) route
 * through the command service via `project.updateMetadata`. Preconditions
 * (`Idempotency-Key`, `If-Match: "<revision>"`) are required — missing
 * returns 428.
 *
 * `is_published` is no longer accepted here: publication is a separate
 * immutable-snapshot workflow owned by Task 8. Setting `visibility=public`
 * still runs moderation and the parental-consent gate; the actual
 * publication flip happens through the publish route Task 8 will add.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authorized = await requireProjectEdit(actor, id);
    const actorProfileId = authorized.project.owner_id;

    const body = await request.json();

    if (body.is_published !== undefined) {
      return NextResponse.json(
        {
          error: 'publication_moved',
          message:
            'is_published is no longer settable here; use the publication candidate endpoint (Task 8).',
        },
        { status: 501 },
      );
    }

    const sanitizedTitle = typeof body.title === 'string' ? sanitizeUserInput(body.title) : undefined;
    const sanitizedDescription = typeof body.description === 'string'
      ? sanitizeUserInput(body.description)
      : undefined;

    const textToCheck = [sanitizedTitle, sanitizedDescription].filter(Boolean).join('\n');
    if (textToCheck) {
      const modResult = await moderateText(
        textToCheck,
        actor.kind === 'user' ? actor.userId : null,
        actor.kind === 'guest' ? actor.profileId : null,
      );
      if (!modResult.safe) {
        return NextResponse.json(
          {
            error: 'Content moderation failed',
            reason: modResult.reason ?? 'Contains disallowed content',
            categories: modResult.categories,
          },
          { status: 422 },
        );
      }
    }

    if (body.visibility === 'public') {
      const sharer = await queryOne<{ role: string; can_share: number | boolean }>(
        'SELECT role, can_share FROM profiles WHERE id = ?',
        [actorProfileId],
      );
      if (actor.kind !== 'user') {
        return NextResponse.json(
          {
            error: 'Account needed',
            reason:
              'Create a free account to share your game. You can keep building and playing as a guest.',
          },
          { status: 403 },
        );
      }
      if (sharer && sharer.role === 'child' && !sharer.can_share) {
        return NextResponse.json(
          {
            error: 'Parental permission needed',
            reason:
              "Because you're under 13, a parent or guardian needs to give permission before you can share games publicly.",
          },
          { status: 403 },
        );
      }
    }

    const command: Record<string, any> = { type: 'project.updateMetadata' };
    if (sanitizedTitle !== undefined) command.title = sanitizedTitle;
    if (sanitizedDescription !== undefined) command.description = sanitizedDescription;
    if (body.thumbnail_url !== undefined) command.thumbnailUrl = body.thumbnail_url;
    if (body.genre !== undefined) command.genre = body.genre;
    if (body.visibility !== undefined) command.visibility = body.visibility;

    if (Object.keys(command).length === 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    return dispatchCompatCommand({
      request,
      actor: toCommandActor(actor),
      projectId: id,
      command: command as any,
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    const authorized = await requireProjectEdit(actor, id);

    // Wrapped in withTransaction in Task 4 so a failure mid-purge cannot leave
    // orphan rows in scenes/game_objects/logic_blocks. The full deletion
    // pipeline (S3 blob refcount decrements, storage GC) is Task 7 of the
    // durable-work plan; this route remains on the write-boundary allowlist
    // until then.
    const affected = await withTransaction(async (connection) => {
      await connection.execute('DELETE FROM project_commands WHERE project_id = ?', [id]);
      await connection.execute('DELETE FROM project_play_snapshots WHERE project_id = ?', [id]);
      await connection.execute('DELETE FROM logic_blocks WHERE project_id = ?', [id]);
      await connection.execute(
        'DELETE FROM game_objects WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)',
        [id],
      );
      await connection.execute('DELETE FROM scenes WHERE project_id = ?', [id]);
      await connection.execute('DELETE FROM assets WHERE project_id = ?', [id]);
      const [result] = await connection.execute(
        'DELETE FROM projects WHERE id = ? AND owner_id = ?',
        [id, authorized.project.owner_id],
      );
      return (result as { affectedRows?: number }).affectedRows ?? 0;
    });

    if (affected === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
