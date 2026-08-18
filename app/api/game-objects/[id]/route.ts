import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireResourceEdit, requireResourceView } from '@/lib/auth/access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    await requireResourceView(actor, 'object', id);

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
    }>(
      `SELECT id, scene_id, type, name, position_x, position_y, position_z,
              rotation, scale_x, scale_y, sprite_url, color, width, height,
              has_physics, is_static, mass, properties
         FROM game_objects
        WHERE id = ?`,
      [id]
    );

    if (!gameObject) {
      return NextResponse.json({ error: 'Game object not found' }, { status: 404 });
    }

    return NextResponse.json(gameObject);
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Game object not found' }, { status: error.status });
    }
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
    const actor = await resolveActor(request);
    await requireResourceEdit(actor, 'object', id);
    const updates = await request.json();

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
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Game object not found' }, { status: error.status });
    }
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
    const actor = await resolveActor(request);
    await requireResourceEdit(actor, 'object', id);

    // Delete logic blocks first (foreign key constraint)
    await query('DELETE FROM logic_blocks WHERE game_object_id = ?', [id]);

    // Delete the game object
    await query('DELETE FROM game_objects WHERE id = ?', [id]);

    return NextResponse.json({ success: true, message: 'Game object deleted' });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Game object not found' }, { status: error.status });
    }
    console.error('Error deleting game object:', error);
    return NextResponse.json(
      { error: 'Failed to delete game object' },
      { status: 500 }
    );
  }
}
