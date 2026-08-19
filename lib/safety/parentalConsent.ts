import { createHash, randomBytes, randomUUID } from 'crypto';
import { query, queryOne, withTransaction } from '@/lib/mysql/server';

/**
 * Verifiable parental consent for under-13 accounts.
 *
 * `/auth/pending-approval` used to claim "We've emailed your parent" while no
 * email code existed anywhere in the repo and `parent_id` was never written.
 * This module issues a single-use, expiring token and records the outcome.
 *
 * NOTE: there is still no mail transport in this codebase. `createConsentRequest`
 * returns the consent URL so the caller can surface it; wiring an email provider
 * is the remaining step before this is a complete COPPA consent mechanism.
 *
 * Task 4 wraps `createConsentRequest` and `resolveConsent` in single
 * transactions. Both write multiple rows and previously ran as sequential
 * independent queries — an interrupted `resolveConsent` (network flake,
 * pool timeout between the two UPDATEs) would leave a `granted` consent
 * row against a profile whose `can_share`/`can_publish` never actually
 * flipped, so the parent's decision was silently un-applied.
 */

const CONSENT_TTL_DAYS = 14;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ConsentRequest {
  consentId: string;
  /** Raw token — only ever returned here, never stored. */
  token: string;
  expiresAt: Date;
}

/** Issue a fresh consent request for a child profile. */
export async function createConsentRequest(
  childProfileId: string,
  parentEmail: string
): Promise<ConsentRequest> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000);
  const consentId = randomUUID();

  // Both writes must land together: leaving a pending row without expiring
  // the earlier one would allow two active consent links for the same
  // child, and expiring the earlier one without inserting the new row
  // would strand the child with no link at all.
  await withTransaction(async (connection) => {
    await connection.execute(
      "UPDATE parental_consents SET status = 'expired' WHERE child_profile_id = ? AND status = 'pending'",
      [childProfileId],
    );
    await connection.execute(
      `INSERT INTO parental_consents (id, child_profile_id, parent_email, token_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [consentId, childProfileId, parentEmail.trim().toLowerCase(), hashToken(token), expiresAt],
    );
  });

  return { consentId, token, expiresAt };
}

export type ConsentOutcome =
  | { ok: true; childProfileId: string }
  | { ok: false; reason: 'not-found' | 'expired' | 'already-answered' };

/** Grant or deny consent by raw token. Single use. */
export async function resolveConsent(
  token: string,
  decision: 'granted' | 'denied'
): Promise<ConsentOutcome> {
  const record = await queryOne<{
    id: string;
    child_profile_id: string;
    status: string;
    expires_at: Date;
  }>(
    'SELECT id, child_profile_id, status, expires_at FROM parental_consents WHERE token_hash = ?',
    [hashToken(token)]
  );

  if (!record) return { ok: false, reason: 'not-found' };
  if (record.status !== 'pending') return { ok: false, reason: 'already-answered' };

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await query("UPDATE parental_consents SET status = 'expired' WHERE id = ?", [record.id]);
    return { ok: false, reason: 'expired' };
  }

  // The decision write and the profile-permission write must land together.
  // The prior code did them as two independent queries; a failure between
  // the two would record the decision but leave the child's permissions
  // stuck at their previous state — the exact failure mode the "no
  // parent has approved" branch was silently swallowing.
  await withTransaction(async (connection) => {
    await connection.execute(
      'UPDATE parental_consents SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?',
      [decision, record.id],
    );
    await connection.execute(
      `UPDATE profiles
       SET parental_approval = ?, parental_approval_at = ?, can_share = ?, can_publish = ?
       WHERE id = ?`,
      [
        decision === 'granted',
        decision === 'granted' ? new Date() : null,
        decision === 'granted',
        decision === 'granted',
        record.child_profile_id,
      ],
    );
  });

  return { ok: true, childProfileId: record.child_profile_id };
}
