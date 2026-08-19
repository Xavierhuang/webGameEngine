import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireResourceEdit } from '@/lib/auth/access';
import { dispatchCompatCommand, toCommandActor } from '@/lib/projects/commandRouteHelper';

/**
 * Persist a new sprite order for one scene.
 *
 * Migrated in Task 4: raw UPDATE against `game_objects` is gone. The
 * command service enforces the "must include every existing object"
 * invariant. Preconditions (`Idempotency-Key`, `If-Match`) required.
 */
export async function POST(request: NextRequest) {
  try {
    const { sceneId, orderedIds } = await request.json();

    if (typeof sceneId !== 'string' || !Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'sceneId and orderedIds required' }, { status: 400 });
    }

    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authorized = await requireResourceEdit(actor, 'scene', sceneId);

    return dispatchCompatCommand({
      request,
      actor: toCommandActor(actor),
      projectId: authorized.project.id,
      command: { type: 'object.reorder', sceneId, objectIds: orderedIds as string[] },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Scene not found' }, { status: error.status });
    }
    console.error('Error reordering objects:', error);
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
  }
}
