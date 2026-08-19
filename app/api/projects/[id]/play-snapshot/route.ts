import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectView } from '@/lib/auth/access';
import {
  writePlaySnapshot,
  CommandServiceError,
} from '@/lib/projects/commandService';
import { CommandErrorCodes } from '@/lib/projects/commandSchema';

/**
 * POST /api/projects/[id]/play-snapshot
 *
 * Materializes an immutable snapshot at the requested revision and returns
 * its identifier. Play mode reads the snapshot instead of live rows so a
 * concurrent editor change never mutates a running session mid-play.
 *
 * The revision the client sends must match the current project revision.
 * A stale `expectedRevision` returns 409 `revision_conflict` — the client
 * (typically the play launcher UI) can then reload, apply outstanding
 * commands, and retry.
 *
 * Requires view rights only. Snapshot creation does not mutate the graph;
 * an editor's revision fence is unaffected.
 */
const PlaySnapshotBodySchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    await requireProjectView(actor, id);

    const raw = await request.json();
    const parsed = PlaySnapshotBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: CommandErrorCodes.ValidationFailed, issues: parsed.error.issues.slice(0, 32) },
        { status: 422 },
      );
    }

    const result = await writePlaySnapshot({
      projectId: id,
      expectedRevision: parsed.data.expectedRevision,
    });

    return NextResponse.json({
      snapshotId: result.snapshotId,
      revision: result.revision,
      contentHash: result.contentHash,
      reused: result.reused,
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
    console.error('[play-snapshot] unexpected error:', error);
    return NextResponse.json({ error: 'snapshot_failed' }, { status: 500 });
  }
}
