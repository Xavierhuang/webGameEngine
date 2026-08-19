import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireResourceEdit } from '@/lib/auth/access';
import { ReorderError, reorderSceneObjects } from '@/lib/auth/reorder';

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

    await reorderSceneObjects(sceneId, orderedIds);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof ReorderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Scene not found' }, { status: error.status });
    }
    console.error('Error reordering objects:', error);
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
  }
}
