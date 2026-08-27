import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { listOwnerWorldReleases } from '@/lib/worlds/releaseAccess';
import { submitWorldRelease } from '@/lib/worlds/releaseService';
import {
  invalidInputResponse,
  parseStrictBody,
  readIdempotencyKey,
  releaseErrorResponse,
  releaseFailureResponse,
  unauthorizedResponse,
} from '@/lib/worlds/releaseRouteErrors';

/** Owner-only release history for the World Builder release panel. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') return unauthorizedResponse();
    return NextResponse.json({ releases: await listOwnerWorldReleases({ actor, projectId: id }) });
  } catch (error) {
    return releaseErrorResponse(error) ?? releaseFailureResponse('owner status', error);
  }
}

/**
 * Idempotent candidate submission.
 *
 * Authorization runs before the body is parsed so an unauthorized caller can
 * never distinguish a malformed request from a rejected one (ledger: Task 4
 * review, Minor #3). The only client-supplied values are the expected revision
 * and the idempotency key; release, project, snapshot, and hash identity are
 * resolved server-side from the route segment and the service's own locks.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    if (actor.kind !== 'user') return unauthorizedResponse();

    const body = await parseStrictBody(request, ['expectedRevision']);
    if (!body) return invalidInputResponse();
    const expectedRevision = body.expectedRevision;
    if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0) {
      return invalidInputResponse();
    }
    const idempotencyKey = readIdempotencyKey(request);
    if (!idempotencyKey) return invalidInputResponse();

    const submission = await submitWorldRelease({
      actor,
      projectId: id,
      expectedRevision: expectedRevision as number,
      idempotencyKey,
    });
    return NextResponse.json({ release: submission }, { status: submission.replayed ? 200 : 201 });
  } catch (error) {
    return releaseErrorResponse(error) ?? releaseFailureResponse('submission', error);
  }
}
