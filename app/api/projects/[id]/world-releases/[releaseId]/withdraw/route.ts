import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { withdrawWorldRelease } from '@/lib/worlds/releaseService';
import {
  invalidInputResponse,
  parseStrictBody,
  releaseErrorResponse,
  releaseFailureResponse,
  unauthorizedResponse,
} from '@/lib/worlds/releaseRouteErrors';

/**
 * Creator withdrawal. Deliberately not gated on `community_publishing`: a
 * creator must be able to pull their world back even after an operator has
 * switched the beta off.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> },
) {
  try {
    const { id, releaseId } = await params;
    const actor = await resolveActor(request);
    if (actor.kind !== 'user') return unauthorizedResponse();

    // The body carries nothing; both identities come from the route segments.
    const body = await parseStrictBody(request, []);
    if (!body) return invalidInputResponse();

    const release = await withdrawWorldRelease({ actor, projectId: id, releaseId });
    return NextResponse.json({ release });
  } catch (error) {
    return releaseErrorResponse(error) ?? releaseFailureResponse('withdrawal', error);
  }
}
