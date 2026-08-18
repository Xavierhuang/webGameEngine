import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireResourceEdit } from '@/lib/auth/access';

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

    const actor = await resolveActor(request);
    await requireResourceEdit(actor, 'scene', sceneId);

    // Scoped to the scene, so an id from another project can't be renumbered.
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (typeof id !== 'string') continue;
      await query('UPDATE game_objects SET order_index = ? WHERE id = ? AND scene_id = ?', [i, id, sceneId]);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Scene not found' }, { status: error.status });
    }
    console.error('Error reordering objects:', error);
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
  }
}
