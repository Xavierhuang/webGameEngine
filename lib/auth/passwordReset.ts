import { createHash, randomBytes, randomUUID } from 'crypto';
import { query, queryOne } from '@/lib/mysql/server';

/**
 * Password reset via a single-use, expiring token.
 *
 * Mirrors lib/safety/parentalConsent.ts: the token is stored only as a SHA-256
 * hash, so a database leak cannot be replayed into account takeovers.
 */

const RESET_TTL_MINUTES = 60;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issue a reset token for an email address.
 *
 * Returns null when no such user exists — the caller must still respond as if
 * it succeeded, or this endpoint becomes an account-enumeration oracle.
 */
export async function createResetRequest(email: string): Promise<string | null> {
  const user = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = ?',
    [email.trim().toLowerCase()]
  );
  if (!user) return null;

  // Invalidate any outstanding tokens so only the newest link works.
  await query('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL', [
    user.id,
  ]);

  const token = randomBytes(32).toString('hex');
  await query(
    'INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [
      randomUUID(),
      user.id,
      hashToken(token),
      new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
    ]
  );

  return token;
}

export type ResetOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/** Validate a token and consume it. Single use. */
export async function consumeResetToken(token: string): Promise<ResetOutcome> {
  const row = await queryOne<{
    id: string;
    user_id: string;
    used_at: Date | null;
    expires_at: Date;
  }>(
    'SELECT id, user_id, used_at, expires_at FROM password_resets WHERE token_hash = ?',
    [hashToken(token)]
  );

  if (!row) return { ok: false, reason: 'invalid' };
  if (row.used_at) return { ok: false, reason: 'used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  await query('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
  return { ok: true, userId: row.user_id };
}

/** The reset email body. Plain text plus HTML, like the consent mail. */
export function passwordResetEmail(resetUrl: string): { subject: string; text: string; html: string } {
  const text = [
    'Someone asked to reset the password on your lingplay account.',
    '',
    'Set a new password here:',
    resetUrl,
    '',
    'This link works once and expires in 1 hour.',
    '',
    "If you didn't ask for this, you can ignore this email — your password stays the same.",
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#0f172a;line-height:1.6">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p style="margin:0 0 12px">Someone asked to reset the password on your lingplay account.</p>
      <p style="margin:20px 0">
        <a href="${escapeHtml(resetUrl)}"
           style="background:#0f172a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">
          Set a new password
        </a>
      </p>
      <p style="margin:0 0 12px;color:#475569;font-size:14px">This link works once and expires in 1 hour.</p>
      <p style="margin:0;color:#64748b;font-size:13px">
        If you didn't ask for this, ignore this email — your password stays the same.
      </p>
    </div>`;

  return { subject: 'Reset your lingplay password', text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
