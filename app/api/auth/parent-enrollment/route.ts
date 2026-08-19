import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientKey, retryMessage } from '@/lib/safety/rateLimit';
import { queryOne, withTransaction } from '@/lib/mysql/server';
import { hashPassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/jwt';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { sendEmail, isEmailConfigured } from '@/lib/email/send';

/**
 * Parent-first enrollment.
 *
 * Before Task 5 the child's signup form had an "I'm a parent" checkbox
 * that granted parent capabilities without any verification. Task 5
 * removes that authority from the client — anyone creating a `parent`
 * profile must go through this route, where the server issues a
 * verification token to the claimed email address before the parent
 * role becomes trusted for consent actions.
 *
 * Verification is handled by a separate consent-style purpose-bound
 * token that lands as `parental_consents.purpose = 'email_verification'`
 * so the same table (and the same expiry / sibling-invalidation rules)
 * covers both flows without extending the schema. The child-invite
 * (parent linking a child profile) is out of scope for this route and
 * lives in the pending-approval + resend flow.
 */

const PARENT_ENROLLMENT_LIMIT = 20;
const PARENT_ENROLLMENT_WINDOW_MS = 60 * 60 * 1000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(
    clientKey(request, 'parent-enrollment'),
    PARENT_ENROLLMENT_LIMIT,
    PARENT_ENROLLMENT_WINDOW_MS,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: retryMessage(limit.retryAfter) },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  try {
    const { email, password, displayName } = await request.json();

    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail],
    );
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Sign in instead.' },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    const userId = randomUUID();
    const profileId = randomUUID();
    const name = typeof displayName === 'string' && displayName.trim().length > 0
      ? displayName.trim().slice(0, 100)
      : `parent_${userId.substring(0, 8)}`;

    // Atomic user + profile + verification token. If any of the three
    // fails, none land — the parent can safely retry with the same email.
    const verificationToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    await withTransaction(async (connection) => {
      await connection.execute(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
        [userId, normalizedEmail, passwordHash],
      );
      await connection.execute(
        `INSERT INTO profiles
           (id, user_id, username, display_name, role, parental_approval,
            content_filter_level, can_share, can_publish, parent_email)
         VALUES (?, ?, ?, ?, 'parent', ?, ?, ?, ?, ?)`,
        [
          profileId,
          userId,
          name,
          name,
          // A parent's own approval flag flips true only after email
          // verification. Before that, the account exists but consent
          // actions taken by it are rejected by the consent route.
          false,
          2,
          false,
          false,
          normalizedEmail,
        ],
      );

      // Purpose-bound token reusing the consent_tokens table (see
      // migration 008). Purpose='email_verification' is what the resolve
      // route matches on so a parent-enrollment token cannot be replayed
      // against a child-consent flow.
      await connection.execute(
        `INSERT INTO consent_tokens (id, profile_id, token_hash, purpose, status, expires_at)
         VALUES (?, ?, ?, 'email_verification', 'pending', ?)`,
        [randomUUID(), profileId, hashToken(verificationToken), expiresAt],
      );
    });

    // Deliver the verification email. If the transport is unconfigured
    // the parent is told so explicitly — no fallback URL is returned to
    // the client because there is no non-attacker context in which the
    // caller of parent-enrollment should ever see the raw token.
    const origin = request.nextUrl.origin;
    const verificationUrl = `${origin}/auth/verify-parent?token=${verificationToken}`;
    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: 'Verify your lingplay parent account',
      text: [
        'Someone (hopefully you) is enrolling as a parent on lingplay.',
        '',
        'Click the link below within 24 hours to verify your email address:',
        verificationUrl,
        '',
        'If you were not expecting this, you can ignore this email and no account',
        'will be verified.',
      ].join('\n'),
    });

    // Return the parent's own auth token so they can sign in immediately;
    // the account exists but consent actions are gated on verification.
    const authToken = generateToken({ userId, email: normalizedEmail });
    const response = NextResponse.json({
      success: true,
      user: { id: userId, email: normalizedEmail },
      verificationEmailSent: emailResult.ok,
      emailConfigured: isEmailConfigured(),
    });
    response.cookies.set('auth-token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return response;
  } catch (error: any) {
    console.error('Parent enrollment error:', error);
    return NextResponse.json({ error: 'Failed to enroll parent account.' }, { status: 500 });
  }
}
