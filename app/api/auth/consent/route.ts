import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientKey, retryMessage } from '@/lib/safety/rateLimit';
import { resolveConsent } from '@/lib/safety/parentalConsent';

/**
 * A parent granting or denying consent for an under-13 account.
 *
 * Task 5 hardening:
 *   - Rate-limited per IP so a stolen token cannot be brute-forced by
 *     hammering the endpoint with variants.
 *   - Wire contract restricted to `{ decision, state }` on success —
 *     no echo of the child's identifier, no consent URL, nothing that
 *     would reveal to the caller more than they already knew.
 *   - Sibling tokens for the same child are atomically expired inside
 *     `resolveConsent`; a leaked resend link cannot be replayed.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'consent'), 30, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: retryMessage(limit.retryAfter) },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  try {
    const { token, decision } = await request.json();

    if (typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'Missing consent token.' }, { status: 400 });
    }
    if (decision !== 'granted' && decision !== 'denied') {
      return NextResponse.json({ error: 'Invalid decision.' }, { status: 400 });
    }

    const outcome = await resolveConsent(token, decision);

    if (!outcome.ok) {
      const messages: Record<string, string> = {
        'not-found': "We couldn't find that consent link. Check it was copied in full.",
        expired: 'That consent link has expired. Ask your child to request a new one.',
        'already-answered': 'That link has already been used.',
      };
      return NextResponse.json({ error: messages[outcome.reason] }, { status: 400 });
    }

    // Only the decision is echoed. The child's profile id from the outcome
    // is deliberately not returned — the parent already saw the child's
    // name on the consent page; the API does not confirm which internal
    // id it maps to.
    return NextResponse.json({
      success: true,
      state: outcome.decision,
    });
  } catch (error: any) {
    console.error('Consent error:', error);
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
  }
}
