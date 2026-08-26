import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { decideWorldRelease } from '@/lib/worlds/releaseService';
import {
  invalidInputResponse,
  parseStrictBody,
  releaseErrorResponse,
  releaseFailureResponse,
  unauthorizedResponse,
} from '@/lib/worlds/releaseRouteErrors';

const DECISION_ACTIONS: readonly string[] = ['publish', 'request_changes', 'reject'];
const DECISION_REASON_CODES: readonly string[] = [
  'content_policy', 'age_safety', 'copyright', 'administrative_action',
];

/**
 * Admin approve / request-changes / reject.
 *
 * The service is the authority on whether the actor is an admin; this handler
 * only refuses anonymous and guest callers up front so an unauthenticated
 * request never reaches body validation. `approved` and `changes_requested` are
 * absent from the accepted reason codes on purpose: those are derived from the
 * action, and the service rejects them if supplied.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  try {
    const { releaseId } = await params;
    const actor = await resolveActor(request);
    if (actor.kind !== 'user') return unauthorizedResponse();

    const body = await parseStrictBody(request, ['action', 'reasonCode']);
    if (!body) return invalidInputResponse();
    const action = body.action;
    if (typeof action !== 'string' || !DECISION_ACTIONS.includes(action)) return invalidInputResponse();

    const reasonCode = body.reasonCode;
    if (reasonCode !== undefined) {
      if (typeof reasonCode !== 'string' || !DECISION_REASON_CODES.includes(reasonCode)) {
        return invalidInputResponse();
      }
      if (action !== 'reject') return invalidInputResponse();
    }

    const release = await decideWorldRelease({
      actor,
      releaseId,
      action: action as 'publish' | 'request_changes' | 'reject',
      ...(reasonCode === undefined ? {} : { reasonCode: reasonCode as 'content_policy' | 'age_safety' | 'copyright' | 'administrative_action' }),
    });
    return NextResponse.json({ release });
  } catch (error) {
    return releaseErrorResponse(error) ?? releaseFailureResponse('decision', error);
  }
}
