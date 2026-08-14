import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/mysql/server';
import { getProjectAccess } from '@/lib/auth/access';
import { sanitizeUserInput } from '@/lib/safety/moderation';

const ALLOWED_FIELDS = new Set([
  'name',
  'background_color',
  'background_image_url',
  'physics_enabled',
  'gravity_y',
  'order_index',
]);

async function authorize(sceneId: string) {
  const scene = await queryOne<{ id: string; project_id: string }>(
    'SELECT id, project_id FROM scenes WHERE id = ?',
    [sceneId]
  );
  if (!scene) return { error: NextResponse.json({ error: 'Scene not found' }, { status: 404 }) };

  const project = await queryOne<{ owner_id: string; visibility: string; moderation_status: string }>(
    'SELECT owner_id, visibility, moderation_status FROM projects WHERE id = ?',
    [scene.project_id]
  );
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };

  const access = await getProjectAccess(project);
  if (!access.canEdit) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };

  return { scene };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authorized = await authorize(id);
    if ('error' in authorized) return authorized.error;

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
    console.error('Error updating scene:', error);
    return NextResponse.json({ error: 'Failed to update scene' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authorized = await authorize(id);
    if ('error' in authorized) return authorized.error;

    // A project must always have at least one scene, or the editor and player
    // have nothing to render.
    const siblings = await queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM scenes WHERE project_id = ?',
      [authorized.scene.project_id]
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
    console.error('Error deleting scene:', error);
    return NextResponse.json({ error: 'Failed to delete scene' }, { status: 500 });
  }
}
