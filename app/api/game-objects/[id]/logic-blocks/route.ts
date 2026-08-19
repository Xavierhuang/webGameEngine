import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireResourceEdit } from '@/lib/auth/access';
import { dispatchCompatCommand, toCommandActor } from '@/lib/projects/commandRouteHelper';

/**
 * Replace all logic blocks for a game object (Blockly editor save path).
 *
 * Migrated in Task 4: DELETE + INSERT against `logic_blocks` is gone; the
 * command service's `object.blocks.replace` handler owns the workspace
 * write inside one transaction. Preconditions (`Idempotency-Key`,
 * `If-Match: "<revision>"`) required.
 *
 * Backward-compat translation: the legacy PUT accepted a flat
 * `{ blocks: [...] }` shape with one row per top-level block. The
 * command handler expects a Blockly workspace JSON tree; the route
 * repackages the flat list into `{ blocks }` so the handler's serializer
 * writes the same shape the reader in `app/api/projects/[id]/route.ts`
 * has been reading.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authorized = await requireResourceEdit(actor, 'object', id);
    const body = await request.json();
    const blocks = body.blocks;

    if (!Array.isArray(blocks)) {
      return NextResponse.json({ error: 'blocks array required' }, { status: 400 });
    }

    return dispatchCompatCommand({
      request,
      actor: toCommandActor(actor),
      projectId: authorized.project.id,
      command: {
        type: 'object.blocks.replace',
        objectId: id,
        workspaceJson: { blocks },
      },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Game object not found' }, { status: error.status });
    }
    console.error('Error saving logic blocks:', error);
    return NextResponse.json({ error: 'Failed to save logic blocks' }, { status: 500 });
  }
}
