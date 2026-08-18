import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectEdit, requireProjectView } from '@/lib/auth/access';
import { moderateText, sanitizeUserInput } from '@/lib/safety/moderation';

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
          `SELECT * FROM logic_blocks WHERE game_object_id IN (${gameObjectIds.map(() => '?').join(',')})`,
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    const authorized = await requireProjectEdit(actor, id);
    const actorProfileId = authorized.project.owner_id;

    const body = await request.json();

    // Only allow updating known project columns (keys are interpolated into SQL)
    const ALLOWED_FIELDS = new Set([
      'title',
      'description',
      'thumbnail_url',
      'is_published',
      'visibility',
      'genre',
    ]);

    // Sanitize + moderate any user-visible text before persisting.
    const sanitizedTitle = typeof body.title === 'string' ? sanitizeUserInput(body.title) : undefined;
    const sanitizedDescription = typeof body.description === 'string' ? sanitizeUserInput(body.description) : undefined;
    const textToCheck = [sanitizedTitle, sanitizedDescription].filter(Boolean).join('\n');
    if (textToCheck) {
      const modResult = await moderateText(
        textToCheck,
        actor.kind === 'user' ? actor.userId : null,
        actor.kind === 'guest' ? actor.profileId : null
      );
      if (!modResult.safe) {
        return NextResponse.json(
          {
            error: 'Content moderation failed',
            reason: modResult.reason ?? 'Contains disallowed content',
            categories: modResult.categories,
          },
          { status: 422 }
        );
      }
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    Object.keys(body).forEach((key) => {
      if (!ALLOWED_FIELDS.has(key) || body[key] === undefined) return;
      let value = body[key];
      if (key === 'title') value = sanitizedTitle;
      else if (key === 'description') value = sanitizedDescription;
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    });

    // Publishing runs the project's text through moderation and records the
    // verdict, so the gallery can filter on moderation_status. Nothing used to
    // ever set this away from its 'pending' default.
    // Under-13 accounts can't publish until a parent has granted consent.
    // `can_share` was selected in the UI but never used in any conditional.
    if (body.visibility === 'public' || body.is_published === true) {
      const sharer = await queryOne<{ role: string; can_share: number | boolean; age: number | null }>(
        'SELECT role, can_share, age FROM profiles WHERE id = ?',
        [actorProfileId]
      );

      // Guests have no account and no recorded age, so we can't establish
      // whether a parent needs to consent. Publishing requires an account —
      // the same rule Scratch applies — and says so plainly rather than
      // showing a parental-permission message to someone who never gave an age.
      if (actor.kind !== 'user') {
        return NextResponse.json(
          {
            error: 'Account needed',
            reason:
              'Create a free account to share your game. You can keep building and playing as a guest.',
          },
          { status: 403 }
        );
      }

      // A registered under-13 needs a parent to consent first.
      if (sharer && sharer.role === 'child' && !sharer.can_share) {
        return NextResponse.json(
          {
            error: 'Parental permission needed',
            reason:
              "Because you're under 13, a parent or guardian needs to give permission before you can share games publicly.",
          },
          { status: 403 }
        );
      }
    }

    if (body.visibility === 'public' || body.is_published === true) {
      // Fall back to the stored text so toggling "share" on an existing project
      // still moderates what is actually about to become public.
      const stored = await queryOne<{ title: string; description: string | null }>(
        'SELECT title, description FROM projects WHERE id = ?',
        [id]
      );
      const publishText = [
        sanitizedTitle ?? stored?.title ?? '',
        sanitizedDescription ?? stored?.description ?? '',
      ].filter(Boolean).join('\n');
      const verdict = publishText
        ? await moderateText(
            publishText,
            actor.kind === 'user' ? actor.userId : null,
            actor.kind === 'guest' ? actor.profileId : null
          )
        : { safe: true as const };
      updateFields.push('moderation_status = ?');
      // Migration 008 removed the legacy mutable-graph "approved" state.
      // Safe content enters the review queue; Task 8 alone may publish an
      // immutable approved snapshot.
      updateValues.push(verdict.safe ? 'moderation_pending' : 'rejected');
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateValues.push(id, actorProfileId);

    await query(
      `UPDATE projects SET ${updateFields.join(', ')} WHERE id = ? AND owner_id = ?`,
      updateValues
    );

    // Fetch updated project
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
    }>('SELECT * FROM projects WHERE id = ?', [id]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
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

    // Delete project (cascade will handle related records). Scoped to the owner,
    // so a non-owner deletes nothing rather than erroring.
    await query('DELETE FROM projects WHERE id = ? AND owner_id = ?', [
      id,
      authorized.project.owner_id,
    ]);

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
