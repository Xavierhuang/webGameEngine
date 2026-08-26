import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { takeDownWorldRelease } from '@/lib/worlds/releaseService';
import {
  invalidInputResponse,
  parseStrictBody,
  releaseErrorResponse,
  releaseFailureResponse,
  unauthorizedResponse,
} from '@/lib/worlds/releaseRouteErrors';

const TAKEDOWN_REASON_CODES: readonly string[] = [
  'content_policy', 'age_safety', 'copyright', 'administrative_action',
];

/**
 * Admin takedown of a published release. Requires an allowlisted adverse
 * reason code; `approved` and `changes_requested` are not takedown reasons.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  try {
    const { releaseId } = await params;
    const actor = await resolveActor(request);
    if (actor.kind !== 'user') return unauthorizedResponse();

    const body = await parseStrictBody(request, ['reasonCode']);
    if (!body) return invalidInputResponse();
    const reasonCode = body.reasonCode;
    if (typeof reasonCode !== 'string' || !TAKEDOWN_REASON_CODES.includes(reasonCode)) {
      return invalidInputResponse();
    }

    const release = await takeDownWorldRelease({
      actor,
      releaseId,
      reasonCode: reasonCode as 'content_policy' | 'age_safety' | 'copyright' | 'administrative_action',
    });
    return NextResponse.json({ release });
  } catch (error) {
    return releaseErrorResponse(error) ?? releaseFailureResponse('takedown', error);
  }
}
