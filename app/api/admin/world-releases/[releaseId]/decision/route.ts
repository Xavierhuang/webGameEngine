import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { requireAdmin } from '@/lib/auth/admin';
import { decideWorldRelease } from '@/lib/worlds/releaseService';
import {
  invalidInputResponse,
  parseStrictBody,
  releaseErrorResponse,
  releaseFailureResponse,
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
    // Inlined rather than routed through the shared helper: the admin AST gate
    // treats any imported call before `requireAdmin` as privileged work running
    // ahead of authorization, and it is right to — this handler must reach its
    // admin check having done nothing else.
    if (actor.kind !== 'user') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    // The service re-checks admin identity inside its own transaction, under a
    // lock on the profile row, which is what actually makes the decision safe.
    // This route-layer check is defense in depth and satisfies the repo-wide
    // invariant that every `app/api/admin` handler gates on `requireAdmin`
    // before it touches anything else — an admin boundary a reviewer cannot see
    // at the HTTP layer is an admin boundary that gets moved by accident.
    if (!await requireAdmin(actor)) {
      return NextResponse.json({ error: 'release_auth_forbidden' }, { status: 403 });
    }

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
