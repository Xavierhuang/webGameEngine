import { NextRequest, NextResponse } from 'next/server';
import { createResetRequest, passwordResetEmail } from '@/lib/auth/passwordReset';
import { sendEmail } from '@/lib/email/send';
import { rateLimit, clientKey } from '@/lib/safety/rateLimit';

/**
 * Request a password-reset link.
 *
 * Always responds the same way whether or not the address exists — otherwise
 * this endpoint tells an attacker which emails have accounts.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'forgot'), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const { email } = await request.json();
    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const token = await createResetRequest(email);
    if (token) {
      const url = `${request.nextUrl.origin}/auth/reset-password?token=${token}`;
      await sendEmail({ to: email.trim().toLowerCase(), ...passwordResetEmail(url) });
    }

    // Identical response either way — see the note above.
    return NextResponse.json({
      ok: true,
      message: "If that email has an account, we've sent a reset link.",
    });
  } catch (error: any) {
    console.error('Forgot-password error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
