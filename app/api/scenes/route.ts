import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectEdit } from '@/lib/auth/access';
import { sanitizeUserInput } from '@/lib/safety/moderation';
import { dispatchCompatCommand, toCommandActor } from '@/lib/projects/commandRouteHelper';

/**
 * Scene creation.
 *
 * Migrated in Task 4: the raw INSERT is gone; the command service is the
 * only writer to `scenes`. Callers must send `Idempotency-Key` and
 * `If-Match: "<revision>"`; missing preconditions return 428.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = String(body.projectId ?? '');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requireProjectEdit(actor, projectId);

    const rawName = typeof body.name === 'string' ? sanitizeUserInput(body.name) : '';
    const name = (rawName || 'New Scene').substring(0, 120);
    const sceneId = typeof body.sceneId === 'string' ? body.sceneId : randomUUID();

    return dispatchCompatCommand({
      request,
      actor: toCommandActor(actor),
      projectId,
      command: {
        type: 'scene.create',
        sceneId,
        name,
        backgroundColor: typeof body.background_color === 'string' ? body.background_color : undefined,
      },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Error creating scene:', error);
    return NextResponse.json({ error: 'Failed to create scene' }, { status: 500 });
  }
}
