import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { rateLimit, clientKey, retryMessage } from '@/lib/safety/rateLimit';
import { withTransaction } from '@/lib/mysql/server';

/**
 * Consume a parent's email-verification token.
 *
 * Task 5's parent-enrollment route mints a `purpose = 'email_verification'`
 * row in `consent_tokens` (migration 008) and delivers the raw token via
 * email. The parent lands on `/auth/verify-parent?token=...` which posts
 * the token here. On success the parent's profile flips to verified —
 * every subsequent consent decision they submit is honored.
 *
 * Everything is single-use + transactional: the row transitions
 * `pending → granted`, `responded_at` is stamped, and the profile flag
 * flips inside the same transaction so a mid-write failure never leaves
 * a verified-but-token-still-pending pair.
 *
 * Rate-limited per-IP against token guessing — same wire shape as the
 * child-consent route.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'verify-parent'), 30, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: retryMessage(limit.retryAfter) },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  try {
    const { token } = await request.json();
    if (typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'Missing token.' }, { status: 400 });
    }

    const outcome = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id, profile_id, status, expires_at
           FROM consent_tokens
          WHERE token_hash = ? AND purpose = 'email_verification'
          FOR UPDATE`,
        [hashToken(token)],
      );
      const record = (rows as Array<{
        id: string;
        profile_id: string;
        status: string;
        expires_at: Date;
      }>)[0];
      if (!record) return { kind: 'not-found' as const };
      if (record.status !== 'pending') return { kind: 'already-answered' as const };
      if (new Date(record.expires_at).getTime() < Date.now()) {
        await connection.execute(
          "UPDATE consent_tokens SET status = 'expired' WHERE id = ?",
          [record.id],
        );
        return { kind: 'expired' as const };
      }

      // Consume + flip parent flag atomically.
      await connection.execute(
        `UPDATE consent_tokens
            SET status = 'granted', consumed_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [record.id],
      );
      // For a parent profile, `parental_approval` doubles as "email
      // verified, may act on consent". A dedicated column would be
      // cleaner but needs a migration; the plan's Task 5 accepts the
      // reuse until then.
      await connection.execute(
        `UPDATE profiles
            SET parental_approval = 1, parental_approval_at = NOW()
          WHERE id = ? AND role = 'parent'`,
        [record.profile_id],
      );
      return { kind: 'ok' as const };
    });

    if (outcome.kind === 'ok') {
      return NextResponse.json({ success: true, state: 'verified' });
    }
    const messages: Record<string, { message: string; status: number }> = {
      'not-found': { message: "We couldn't find that verification link. Check it was copied in full.", status: 400 },
      expired: { message: 'That verification link has expired. Enroll again to receive a new one.', status: 400 },
      'already-answered': { message: 'That link has already been used.', status: 400 },
    };
    const mapped = messages[outcome.kind];
    return NextResponse.json({ error: outcome.kind, message: mapped.message }, { status: mapped.status });
  } catch (error: any) {
    console.error('Parent verification error:', error);
    return NextResponse.json({ error: 'Failed to verify parent.' }, { status: 500 });
  }
}
