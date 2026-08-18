import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireResourceEdit } from '@/lib/auth/access';
import { sanitizeUserInput } from '@/lib/safety/moderation';

const ALLOWED_FIELDS = new Set([
  'name',
  'background_color',
  'background_image_url',
  'physics_enabled',
  'gravity_y',
  'order_index',
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    await requireResourceEdit(actor, 'scene', id);

    const body = await request.json();
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    Object.keys(body).forEach((key) => {
      if (!ALLOWED_FIELDS.has(key) || body[key] === undefined) return;
      let value = body[key];
      if (key === 'name') value = sanitizeUserInput(String(value)).substring(0, 255);
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    });

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateValues.push(id);
    await query(`UPDATE scenes SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

    const scene = await queryOne<any>('SELECT * FROM scenes WHERE id = ?', [id]);
    return NextResponse.json({ scene });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Scene not found' }, { status: error.status });
    }
    console.error('Error updating scene:', error);
    return NextResponse.json({ error: 'Failed to update scene' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    const authorized = await requireResourceEdit(actor, 'scene', id);

    // A project must always have at least one scene, or the editor and player
    // have nothing to render.
    const siblings = await queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM scenes WHERE project_id = ?',
      [authorized.project.id]
    );
    if ((siblings?.count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "A project needs at least one scene — you can't delete the last one." },
        { status: 400 }
      );
    }

    await query('DELETE FROM scenes WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Scene not found' }, { status: error.status });
    }
    console.error('Error deleting scene:', error);
    return NextResponse.json({ error: 'Failed to delete scene' }, { status: 500 });
  }
}
