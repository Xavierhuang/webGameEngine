import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query, queryOne } from '@/lib/mysql/server';
import { getProjectAccess } from '@/lib/auth/access';
import { sanitizeUserInput } from '@/lib/safety/moderation';

/**
 * Scene CRUD.
 *
 * There was no scenes route at all: the only scene ever created was the single
 * "Main Scene" inserted at project creation, and every editor path resolved to
 * `scenes[0]`. That made the multi-scene runtime and the three scene blocks
 * (`switch_to_scene`, `next_scene`, `when_scene_starts`) unreachable.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = String(body.projectId ?? '');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const project = await queryOne<{ owner_id: string; visibility: string; moderation_status: string }>(
      'SELECT owner_id, visibility, moderation_status FROM projects WHERE id = ?',
      [projectId]
    );
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const access = await getProjectAccess(project);
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rawName = typeof body.name === 'string' ? sanitizeUserInput(body.name) : '';
    const name = (rawName || 'New Scene').substring(0, 255);

    // order_index is UNIQUE per project, so append after the current max.
    const last = await queryOne<{ max_order: number | null }>(
      'SELECT MAX(order_index) AS max_order FROM scenes WHERE project_id = ?',
      [projectId]
    );
    const orderIndex = (last?.max_order ?? -1) + 1;

    const id = randomUUID();
    await query(
      `INSERT INTO scenes (id, project_id, name, order_index, background_color)
       VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, name, orderIndex, body.background_color || '#87CEEB']
    );

    const scene = await queryOne<any>('SELECT * FROM scenes WHERE id = ?', [id]);
    return NextResponse.json({ scene });
  } catch (error: any) {
    console.error('Error creating scene:', error);
    return NextResponse.json({ error: 'Failed to create scene' }, { status: 500 });
  }
}
