import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { requireAdmin } from '@/lib/auth/admin';
import { takeDownWorldRelease } from '@/lib/worlds/releaseService';
import {
  invalidInputResponse,
  parseStrictBody,
  releaseErrorResponse,
  releaseFailureResponse,
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
