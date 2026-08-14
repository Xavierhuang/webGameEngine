import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, query, queryOne } from '@/lib/mysql/server';
import { getProjectAccess } from '@/lib/auth/access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser();

    const gameObject = await queryOne<{
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
    }>('SELECT * FROM game_objects WHERE id = ?', [id]);

    if (!gameObject) {
      return NextResponse.json({ error: 'Game object not found' }, { status: 404 });
    }

    // Check if user has access to this object's scene/project
    const scene = await queryOne<{ project_id: string }>(
      'SELECT project_id FROM scenes WHERE id = ?',
      [gameObject.scene_id]
    );

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    const project = await queryOne<{ owner_id: string; visibility: string }>(
      'SELECT owner_id, visibility FROM projects WHERE id = ?',
      [scene.project_id]
    );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check access (same logic as project GET)
    if (user) {
      const profile = await queryOne<{ id: string }>(
        'SELECT id FROM profiles WHERE user_id = ?',
        [user.id]
      );
      
      if (profile && project.owner_id !== profile.id && project.visibility !== 'public') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      if (project.visibility !== 'public') {
        // Guests can access their own projects
      }
    }

    return NextResponse.json(gameObject);
  } catch (error: any) {
    console.error('Error fetching game object:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game object' },
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
    const user = await getAuthenticatedUser();
    const updates = await request.json();

    // Verify object exists and user has access
    const gameObject = await queryOne<{ scene_id: string }>(
      'SELECT scene_id FROM game_objects WHERE id = ?',
      [id]
    );

    if (!gameObject) {
      return NextResponse.json({ error: 'Game object not found' }, { status: 404 });
    }

    // Check access (same as GET)
    const scene = await queryOne<{ project_id: string }>(
      'SELECT project_id FROM scenes WHERE id = ?',
      [gameObject.scene_id]
    );

    if (scene) {
      const project = await queryOne<{ owner_id: string; visibility: string }>(
        'SELECT owner_id, visibility FROM projects WHERE id = ?',
        [scene.project_id]
      );

      // Writes are owner-only. This check used to sit inside `if (project &&
      // user)`, so an unauthenticated caller skipped it entirely and could
      // mutate any project's objects. `visibility === 'public'` must never
      // grant write access.
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      const access = await getProjectAccess(project);
      if (!access.canEdit) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Build update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    const allowedFields = [
      'name', 'type', 'position_x', 'position_y', 'position_z',
      'rotation', 'scale_x', 'scale_y', 'sprite_url', 'color',
      'width', 'height', 'has_physics', 'is_static', 'mass', 'properties'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'properties' && typeof updates[field] === 'object') {
          updateFields.push(`${field} = ?`);
          updateValues.push(JSON.stringify(updates[field]));
        } else {
          updateFields.push(`${field} = ?`);
          updateValues.push(updates[field]);
        }
      }
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updateValues.push(id);

    await query(
      `UPDATE game_objects SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Fetch updated object
    const updatedObject = await queryOne('SELECT * FROM game_objects WHERE id = ?', [id]);

    return NextResponse.json(updatedObject);
  } catch (error: any) {
    console.error('Error updating game object:', error);
    return NextResponse.json(
      { error: 'Failed to update game object' },
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
    const user = await getAuthenticatedUser();

    // Verify object exists and user has access
    const gameObject = await queryOne<{ scene_id: string }>(
      'SELECT scene_id FROM game_objects WHERE id = ?',
      [id]
    );

    if (!gameObject) {
      return NextResponse.json({ error: 'Game object not found' }, { status: 404 });
    }

    // Check access (same as GET)
    const scene = await queryOne<{ project_id: string }>(
      'SELECT project_id FROM scenes WHERE id = ?',
      [gameObject.scene_id]
    );

    if (scene) {
      const project = await queryOne<{ owner_id: string; visibility: string }>(
        'SELECT owner_id, visibility FROM projects WHERE id = ?',
        [scene.project_id]
      );

      // Writes are owner-only. This check used to sit inside `if (project &&
      // user)`, so an unauthenticated caller skipped it entirely and could
      // mutate any project's objects. `visibility === 'public'` must never
      // grant write access.
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      const access = await getProjectAccess(project);
      if (!access.canEdit) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Delete logic blocks first (foreign key constraint)
    await query('DELETE FROM logic_blocks WHERE game_object_id = ?', [id]);

    // Delete the game object
    await query('DELETE FROM game_objects WHERE id = ?', [id]);

    return NextResponse.json({ success: true, message: 'Game object deleted' });
  } catch (error: any) {
    console.error('Error deleting game object:', error);
    return NextResponse.json(
      { error: 'Failed to delete game object' },
      { status: 500 }
    );
  }
}

