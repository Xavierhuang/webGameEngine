import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/mysql/server';
import { getProjectAccess } from '@/lib/auth/access';

/**
 * Persist a new sprite order for one scene.
 *
 * Body: { sceneId, orderedIds } — index in the array becomes order_index.
 * game_objects previously had no ordering column, so the sprite list rendered
 * in arbitrary database order and could not be rearranged.
 */
export async function POST(request: NextRequest) {
  try {
    const { sceneId, orderedIds } = await request.json();

    if (typeof sceneId !== 'string' || !Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'sceneId and orderedIds required' }, { status: 400 });
    }

    const scene = await queryOne<{ project_id: string }>(
      'SELECT project_id FROM scenes WHERE id = ?',
      [sceneId]
    );
    if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 });

    const project = await queryOne<{ owner_id: string; visibility: string; moderation_status: string }>(
      'SELECT owner_id, visibility, moderation_status FROM projects WHERE id = ?',
      [scene.project_id]
    );
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const access = await getProjectAccess(project);
    if (!access.canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Scoped to the scene, so an id from another project can't be renumbered.
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (typeof id !== 'string') continue;
      await query('UPDATE game_objects SET order_index = ? WHERE id = ? AND scene_id = ?', [i, id, sceneId]);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error reordering objects:', error);
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
  }
}
