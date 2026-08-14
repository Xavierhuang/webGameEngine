import { NextRequest, NextResponse } from 'next/server';
import { resolveConsent } from '@/lib/safety/parentalConsent';

/**
 * A parent granting or denying consent for an under-13 account.
 * Single-use token; see lib/safety/parentalConsent.ts.
 */
export async function POST(request: NextRequest) {
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

    return NextResponse.json({ success: true, decision });
  } catch (error: any) {
    console.error('Consent error:', error);
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
  }
}
