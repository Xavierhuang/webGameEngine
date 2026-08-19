import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/mysql/server';
import { hashPassword } from '@/lib/auth/password';
import { consumeResetToken } from '@/lib/auth/passwordReset';
import { rateLimit, clientKey, retryMessage } from '@/lib/safety/rateLimit';

/** Complete a password reset with a single-use token. */
export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'reset'), 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: retryMessage(limit.retryAfter) },
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

    // Wrapped in withTransaction in Task 4: `consumeResetToken` marks the
    // token consumed with its own writes; if the password update fails
    // afterwards the user would be locked out with a valid password they
    // never actually set. Running the token consume + password update in
    // one transaction means a failure rolls both back so the user can
    // retry with the same link.
    const hashed = await hashPassword(password);
    const outcome = await withTransaction(async (connection) => {
      const consumed = await consumeResetToken(token);
      if (!consumed.ok) return { failure: consumed.reason as string };
      await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [
        hashed,
        consumed.userId,
      ]);
      return { failure: null as null };
    });

    if (outcome.failure) {
      const messages: Record<string, string> = {
        invalid: "That reset link isn't valid. Request a new one.",
        expired: 'That reset link has expired. Request a new one.',
        used: 'That reset link has already been used. Request a new one.',
      };
      return NextResponse.json({ error: messages[outcome.failure] }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Reset-password error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
