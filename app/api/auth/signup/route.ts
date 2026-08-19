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
  isValidAge,
  MIN_AGE,
  MAX_AGE,
} from '@/lib/safety/coppa';
import { createConsentRequest } from '@/lib/safety/parentalConsent';
import { sendEmail, parentalConsentEmail } from '@/lib/email/send';
import { expireLegacyGuestCookie } from '@/lib/auth/guestSession';

async function handlePost(request: NextRequest) {
  // Credential stuffing / account-spam guard — there was no rate limiting
  // anywhere on the auth endpoints.
  //
  // The cap is sized for a classroom, not an individual. This app is aimed at
  // schools, where a whole class shares one NAT address: at the previous 5 per
  // hour, the sixth child to sign up was locked out for an hour and so was
  // everyone after them. 40 still bounds bulk account creation from a single
  // address while letting a class of thirty start together.
  const limit = rateLimit(clientKey(request, 'signup'), 40, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: retryMessage(limit.retryAfter) },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const { email, password, username, isParent, dateOfBirth, parentEmail } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      );
    }

    // Age gating. `profiles.age` existed from the first migration and was never
    // collected — every downstream consumer (AI prompt tuning, content filter,
    // share permissions) fell back to a hardcoded default.
    const age = typeof dateOfBirth === 'string' ? ageFromDateOfBirth(dateOfBirth) : null;
    if (age === null) {
      return NextResponse.json(
        { error: 'Please enter a valid date of birth.' },
        { status: 400 }
      );
    }
    if (!isParent && !isValidAge(age)) {
      return NextResponse.json(
        { error: `Accounts are for ages ${MIN_AGE}–${MAX_AGE}. A parent can create an account instead.` },
        { status: 400 }
      );
    }

    const policy = agePolicy(isParent ? 18 : age, false);

    // Under-13s must nominate a parent so consent can be requested.
    if (!isParent && policy.requiresParentalConsent) {
      if (typeof parentEmail !== 'string' || !parentEmail.includes('@')) {
        return NextResponse.json(
          { error: "Because you're under 13, we need a parent or guardian's email address." },
          { status: 400 }
        );
      }
    }

    // Check if user already exists
    const existingUser = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user + profile atomically. The prior code had two separate
    // writes: if the profile INSERT failed for any reason (dup email
    // collision on the profile trigger, foreign-key race, DB blip), the
    // caller ended up with a users row and no profile — the same broken
    // state the "after_user_insert" trigger was supposed to prevent.
    // Task 4 wraps both in one transaction so either both land or neither.
    const userId = randomUUID();
    const profileName = username || `user_${userId.substring(0, 8)}`;
    await withTransaction(async (connection) => {
      await connection.execute(
        'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
        [userId, email, passwordHash],
      );
      await connection.execute(
        `INSERT INTO profiles
           (id, user_id, username, display_name, role, age,
            parental_approval, content_filter_level, can_share, can_publish)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           username = VALUES(username),
           display_name = VALUES(display_name),
           role = VALUES(role),
           age = VALUES(age),
           parental_approval = VALUES(parental_approval),
           content_filter_level = VALUES(content_filter_level),
           can_share = VALUES(can_share),
           can_publish = VALUES(can_publish)`,
        [
          randomUUID(),
          userId,
          profileName,
          profileName,
          isParent ? 'parent' : 'child',
          isParent ? null : age,
          isParent ? true : false,
          policy.contentFilterLevel,
          policy.canShare,
          policy.canShare,
        ],
      );
    });

    // Link the child to a parent profile so consent can be requested. If the
    // parent already has an account we attach immediately; otherwise we record
    // the pending request against the child's profile.
    let consentUrl: string | null = null;
    let emailSent = false;
    if (!isParent && policy.requiresParentalConsent && typeof parentEmail === 'string') {
      const parent = await queryOne<{ id: string }>(
        `SELECT p.id FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE u.email = ? AND p.role = 'parent'`,
        [parentEmail.trim().toLowerCase()]
      );
      await query(
        'UPDATE profiles SET parent_id = ?, parent_email = ? WHERE user_id = ?',
        [parent?.id ?? null, parentEmail.trim().toLowerCase(), userId]
      );

      const childProfile = await queryOne<{ id: string }>(
        'SELECT id FROM profiles WHERE user_id = ?',
        [userId]
      );
      if (!childProfile) {
        // Previously this branch was simply skipped, so a missing profile meant
        // no consent request was ever created and the response claimed neither
        // "emailed" nor "here's the link" — an under-13 account silently ended
        // up with no route to consent at all.
        console.error('[signup] no profile for user', userId, '— cannot create consent request');
        return NextResponse.json(
          { error: 'Could not finish setting up the account. Please try again.' },
          { status: 500 }
        );
      }
      {
        const consent = await createConsentRequest(childProfile.id, parentEmail);
        const origin = request.nextUrl.origin;
        const url = `${origin}/parent/consent?token=${consent.token}`;

        const sent = await sendEmail({
          to: parentEmail.trim().toLowerCase(),
          ...parentalConsentEmail({
            childName: username || 'Your child',
            consentUrl: url,
          }),
        });
        emailSent = sent.ok;

        // Only hand the link back when we could not deliver it. Showing it
        // unconditionally would let a child bypass the parent entirely; hiding
        // it when mail is unconfigured would strand them with no path at all.
        if (!sent.ok) consentUrl = url;
      }
    }

    // Generate token
    const token = generateToken({
      userId,
      email,
    });

    // Set cookie
    const response = NextResponse.json({
      success: true,
      user: { id: userId, email },
      requiresParentalConsent: policy.requiresParentalConsent && !isParent,
      parentEmailSent: emailSent,
      parentEmail: emailSent ? parentEmail : null,
      // Only present when the email could not be delivered.
      consentUrl,
    });
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const response = await handlePost(request);
  expireLegacyGuestCookie(response);
  return response;
}
