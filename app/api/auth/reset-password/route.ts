import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql/server';
import { hashPassword } from '@/lib/auth/password';
import { consumeResetToken } from '@/lib/auth/passwordReset';
import { rateLimit, clientKey } from '@/lib/safety/rateLimit';

/** Complete a password reset with a single-use token. */
export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'reset'), 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const { token, password } = await request.json();

    if (typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'Missing reset token.' }, { status: 400 });
    }
    // Same minimum the signup route enforces.
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const outcome = await consumeResetToken(token);
    if (!outcome.ok) {
      const messages: Record<string, string> = {
        invalid: "That reset link isn't valid. Request a new one.",
        expired: 'That reset link has expired. Request a new one.',
        used: 'That reset link has already been used. Request a new one.',
      };
      return NextResponse.json({ error: messages[outcome.reason] }, { status: 400 });
    }

    await query('UPDATE users SET password_hash = ? WHERE id = ?', [
      await hashPassword(password),
      outcome.userId,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Reset-password error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
