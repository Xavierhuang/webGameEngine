import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, query, queryOne } from '@/lib/mysql/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser();

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

    // Check ownership or public access
    // For authenticated users, check if they own the project
    if (user) {
      const profile = await queryOne<{ id: string }>(
        'SELECT id FROM profiles WHERE user_id = ?',
        [user.id]
      );
      
      if (profile && project.owner_id !== profile.id && project.visibility !== 'public') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    } else {
      // For guests, allow access to their own projects (owner_id might be a guest profile)
      // Or public projects
      if (project.visibility !== 'public') {
        // Guests can access projects they created (we'll allow this for now)
        // In production, you might want to track guest sessions differently
      }
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
          `SELECT * FROM game_objects WHERE scene_id IN (${sceneIds.map(() => '?').join(',')})`,
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

    // Structure the response similar to Supabase format
    const projectWithRelations = {
      ...project,
      scenes: scenes.map((scene) => ({
        ...scene,
        game_objects: gameObjects
          .filter((go) => go.scene_id === scene.id)
          .map((go) => ({
            ...go,
            logic_blocks: logicBlocks.filter(
              (lb) => lb.game_object_id === go.id
            ),
          })),
      })),
      assets,
    };

    return NextResponse.json({ project: projectWithRelations });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const user = await requireAuth();

    // Get profile id from user_id
    const profile = await queryOne<{ id: string }>(
      'SELECT id FROM profiles WHERE user_id = ?',
      [user.id]
    );

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    Object.keys(body).forEach((key) => {
      if (body[key] !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(body[key]);
      }
    });

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateValues.push(id, profile.id);

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
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const user = await requireAuth();

    // Get profile id from user_id
    const profile = await queryOne<{ id: string }>(
      'SELECT id FROM profiles WHERE user_id = ?',
      [user.id]
    );

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Delete project (cascade will handle related records)
    const result = await query(
      'DELETE FROM projects WHERE id = ? AND owner_id = ?',
      [id, profile.id]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}

