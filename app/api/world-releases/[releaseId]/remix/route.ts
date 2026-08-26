import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { remixWorldRelease } from '@/lib/worlds/releaseRemix';
import {
  invalidInputResponse,
  parseStrictBody,
  releaseErrorResponse,
  releaseFailureResponse,
  unauthorizedResponse,
} from '@/lib/worlds/releaseRouteErrors';

/**
 * Remix a published world release into a new private project.
 *
 * Only currently-public releases are remixable; a withdrawn, taken-down,
 * superseded, or still-under-review release returns 404 so a visitor cannot
 * use this endpoint to enumerate release state.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  try {
    const { releaseId } = await params;
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') return unauthorizedResponse();

    const body = await parseStrictBody(request, []);
    if (!body) return invalidInputResponse();

    const remix = await remixWorldRelease({ actor, releaseId });
    return NextResponse.json(remix, { status: 201 });
  } catch (error) {
    return releaseErrorResponse(error) ?? releaseFailureResponse('remix', error);
  }
}
