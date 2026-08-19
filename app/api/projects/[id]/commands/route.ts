import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectEdit } from '@/lib/auth/access';
import {
  executeProjectCommand,
  CommandServiceError,
} from '@/lib/projects/commandService';
import { CommandErrorCodes } from '@/lib/projects/commandSchema';

/**
 * POST /api/projects/[id]/commands
 *
 * The only mutation surface for a project's graph. Every editor
 * write — metadata, scenes, objects, block workspaces — arrives as a
 * `ProjectCommandEnvelope` and is dispatched through the command service,
 * which owns transactions, idempotency, and revision reconciliation.
 *
 * This route intentionally does one thing:
 *   1. Resolve the actor and require project edit.
 *   2. Hand the raw JSON body to `executeProjectCommand`.
 *   3. Serialize the wire result (or a well-known error code).
 *
 * All schema validation, precondition checks, and handler dispatch live in
 * the service. Everything else in the durable-work plan is designed
 * against this single mutation surface.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    const authorized = await requireProjectEdit(actor, id);

    const body = await request.json();
    const result = await executeProjectCommand({
      actor: {
        kind: actor.kind === 'user' ? 'user' : 'guest',
        // `requireProjectEdit` guarantees a non-anonymous actor at this
        // point; both branches of the union carry a profileId.
        profileId: authorized.project.owner_id,
        actorKey:
          actor.kind === 'user'
            ? `user:${actor.userId}`
            : actor.kind === 'guest'
              ? `guest:${actor.profileId}`
              : 'anonymous',
      },
      projectId: id,
      envelope: body,
    });

    return NextResponse.json({
      commandId: result.commandId,
      revision: result.revision,
      result: result.result,
      replayed: result.replayed,
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    if (error instanceof CommandServiceError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          ...(error.code === CommandErrorCodes.RevisionConflict &&
          error.attributes?.currentRevision !== undefined
            ? { currentRevision: error.attributes.currentRevision }
            : {}),
        },
        { status: error.httpStatus },
      );
    }
    console.error('[commands] unexpected error:', error);
    return NextResponse.json({ error: 'command_failed' }, { status: 500 });
  }
}
