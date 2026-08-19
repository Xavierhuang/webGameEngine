import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientKey, retryMessage } from '@/lib/safety/rateLimit';
import { query, queryOne } from '@/lib/mysql/client';
import { withTransaction } from '@/lib/mysql/transaction';
import { hashPassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/jwt';
import { randomUUID } from 'crypto';
import {
  ageFromDateOfBirth,
  agePolicy,
  birthMonthFromDateOfBirth,
  isValidAge,
  MIN_AGE,
  MAX_AGE,
} from '@/lib/safety/coppa';
import { createConsentRequest } from '@/lib/safety/parentalConsent';
import { sendEmail, parentalConsentEmail } from '@/lib/email/send';
import { expireLegacyGuestCookie } from '@/lib/auth/guestSession';

/**
 * Child (or ambiguous-age) signup.
 *
 * Task 5 stripped the client `isParent` authority. Anyone claiming they
 * are a parent must go through `/api/auth/parent-enrollment`, where the
 * server verifies the email before creating a parent role. This route
 * only creates `child` accounts — the age band is derived from the DOB
 * and stored as `birth_month` (migration 008) so the raw age never
 * leaves the request body.
 *
 * The response NEVER contains a consent URL or token, even when the
 * mail transport is unconfigured. The child sees only their state (a
 * `pending` account) and where the consent email was sent. A parent who
 * doesn't receive the email uses the pending-approval page's resend
 * button, which is server-rate-limited by
 * `resendConsentRequest`.
 */
async function handlePost(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'signup'), 40, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: retryMessage(limit.retryAfter) },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  try {
    const { email, password, username, dateOfBirth, parentEmail } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      );
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      );
    }

    const age = typeof dateOfBirth === 'string' ? ageFromDateOfBirth(dateOfBirth) : null;
    if (age === null) {
      return NextResponse.json(
        { error: 'Please enter a valid date of birth.' },
        { status: 400 },
      );
    }
    if (!isValidAge(age)) {
      return NextResponse.json(
        {
          error: `Accounts are for ages ${MIN_AGE}–${MAX_AGE}. A parent must use the parent enrollment page instead.`,
          parentEnrollmentUrl: '/auth/parent-enrollment',
        },
        { status: 400 },
      );
    }

    const policy = agePolicy(age, false);
    const birthMonth = birthMonthFromDateOfBirth(dateOfBirth);

    if (policy.requiresParentalConsent) {
      if (typeof parentEmail !== 'string' || !parentEmail.includes('@')) {
        return NextResponse.json(
          { error: "Because you're under 13, we need a parent or guardian's email address." },
          { status: 400 },
        );
      }
    }

    const existingUser = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE email = ?',
      [email],
    );
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    const userId = randomUUID();
    const profileId = randomUUID();
    const profileName = username || `user_${userId.substring(0, 8)}`;
    const parentEmailNormalized =
      policy.requiresParentalConsent && typeof parentEmail === 'string'
        ? parentEmail.trim().toLowerCase()
        : null;

    // User + profile in one transaction so a partial insert cannot leave a
    // users row with no profile — same rule as Task 4's atomic write.
    await withTransaction(async (connection) => {
      await connection.execute(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
        [userId, email, passwordHash],
      );
      await connection.execute(
        `INSERT INTO profiles
           (id, user_id, username, display_name, role, age, birth_month,
            parental_approval, content_filter_level, can_share, can_publish, parent_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           username = VALUES(username),
           display_name = VALUES(display_name),
           role = VALUES(role),
           age = VALUES(age),
           birth_month = VALUES(birth_month),
           parental_approval = VALUES(parental_approval),
           content_filter_level = VALUES(content_filter_level),
           can_share = VALUES(can_share),
           can_publish = VALUES(can_publish),
           parent_email = VALUES(parent_email)`,
        [
          profileId,
          userId,
          profileName,
          profileName,
          'child',
          age,
          birthMonth,
          false,
          policy.contentFilterLevel,
          false,
          false,
          parentEmailNormalized,
        ],
      );
    });

    let consentState: 'not_required' | 'pending' = 'not_required';
    let parentEmailSent = false;
    if (policy.requiresParentalConsent && parentEmailNormalized) {
      const consent = await createConsentRequest(profileId, parentEmailNormalized);
      const origin = request.nextUrl.origin;
      const url = `${origin}/parent/consent?token=${consent.token}`;

      const sent = await sendEmail({
        to: parentEmailNormalized,
        ...parentalConsentEmail({
          childName: username || 'Your child',
          consentUrl: url,
        }),
      });
      parentEmailSent = sent.ok;
      // The raw consent URL is intentionally NOT returned to the child.
      // If mail is unconfigured the parent must be contacted through
      // another channel; a resend from /api/auth/consent/resend delivers
      // a fresh link server-side.
      consentState = 'pending';
    }

    const token = generateToken({ userId, email });
    const response = NextResponse.json({
      success: true,
      user: { id: userId, email },
      requiresParentalConsent: policy.requiresParentalConsent,
      consentState,
      // Only the address the email was sent to. Never the URL, never the token.
      parentEmailSent,
      parentEmail: parentEmailSent ? parentEmailNormalized : null,
    });
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const response = await handlePost(request);
  expireLegacyGuestCookie(response);
  return response;
}
