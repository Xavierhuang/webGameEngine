import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientKey, retryMessage } from '@/lib/safety/rateLimit';
import { resolveActor } from '@/lib/auth/actor';
import { resendConsentRequest, loadConsentStatus } from '@/lib/safety/parentalConsent';
import { sendEmail, parentalConsentEmail } from '@/lib/email/send';
import { queryOne } from '@/lib/mysql/server';

/**
 * Resend the parental consent email.
 *
 * The child signup never returns the raw consent URL. If the mail didn't
 * arrive or the parent lost the link, the child (signed in) hits this
 * route from the pending-approval page and the server mints a fresh
 * token — which atomically expires the previous one in
 * `resendConsentRequest`.
 *
 * Rate-limited two ways:
 *   - HTTP: per-IP per hour, so a bulk-resend attack does not spam a
 *     parent's inbox.
 *   - Application: `resendConsentRequest` enforces a 5-minute cooldown
 *     between successful resends for the same child, so even a compromised
 *     child session cannot fire off inbox-spam.
 *
 * The response NEVER contains a token or URL — same rule as the signup
 * response. The client only sees the outcome state.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'consent-resend'), 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: retryMessage(limit.retryAfter) },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  try {
    const actor = await resolveActor(request);
    if (actor.kind !== 'user') {
      // A parent could not have signed in as this child, so demanding a
      // user session (not a guest, not anonymous) is the tightest gate
      // that still lets the pending-approval page work at all.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await queryOne<{ id: string; role: string }>(
      'SELECT id, role FROM profiles WHERE user_id = ?',
      [actor.userId],
    );
    if (!profile || profile.role !== 'child') {
      return NextResponse.json(
        { error: 'Only a child profile can request a consent resend.' },
        { status: 403 },
      );
    }

    const outcome = await resendConsentRequest(profile.id);
    if (!outcome.ok) {
      const messages: Record<string, { message: string; status: number }> = {
        'no-record': {
          message: 'No consent record exists for this account.',
          status: 400,
        },
        cooldown: {
          message: 'Please wait a few minutes before resending.',
          status: 429,
        },
        'already-answered': {
          message: 'Consent has already been decided; a resend would do nothing.',
          status: 409,
        },
      };
      const mapped = messages[outcome.reason];
      return NextResponse.json({ error: outcome.reason, message: mapped.message }, { status: mapped.status });
    }

    const origin = request.nextUrl.origin;
    const consentUrl = `${origin}/parent/consent?token=${outcome.child.token}`;
    const sent = await sendEmail({
      to: outcome.parentEmail,
      ...parentalConsentEmail({
        childName: profile.id.slice(0, 6),
        consentUrl,
      }),
    });

    const status = await loadConsentStatus(profile.id);
    return NextResponse.json({
      success: true,
      // Wire contract: state + resend-eligibility. Never the URL, never
      // the token, never the parent's raw email.
      consentState: status.state,
      canResendAt: status.canResendAt,
      emailSent: sent.ok,
    });
  } catch (error: any) {
    console.error('Consent resend error:', error);
    return NextResponse.json({ error: 'Failed to resend consent email.' }, { status: 500 });
  }
}
