import { createHash, randomBytes, randomUUID } from 'crypto';
import { queryOne, withTransaction } from '../mysql/server';
import type { ConsentState } from './capabilities';

/**
 * Parent-first parental consent state machine.
 *
 * The old flow gave the child everything they needed to fake consent: a
 * self-declared `isParent` checkbox on signup and a 14-day consent URL
 * handed back in the child's own API response. Task 5 rewrites both:
 *
 *   1. Tokens are purpose-bound, hash-only, 24-hour expiring, never
 *      returned to the child. The child API response exposes only
 *      `consentState` + `canResendAt`.
 *
 *   2. Any state change on a consent record atomically invalidates every
 *      sibling token for the same child. That means a resend supersedes
 *      the previous link (the parent can only ever act on the newest
 *      link), and a grant/deny/expire closes the whole child's outstanding
 *      set — a leaked older link cannot resurrect a decision.
 *
 *   3. Approval unlocks the "granted" set of capabilities in
 *      `capabilities.ts`; denial and expiry pin the child at "pending"
 *      capabilities (private editing only). The child stays useful even
 *      when consent is not granted.
 *
 * Everything below is transactional. The old code had two independent
 * writes on both create and resolve — an interrupted resolve used to
 * flip the consent row without ever flipping the profile permissions.
 */

const CONSENT_TTL_MS = 24 * 60 * 60 * 1000;
// Minimum delay between resend attempts. The parent has to actually be
// checking their inbox before we let the child spam them again.
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// The purpose field pins the token to a specific consent flow so a link
// stolen from one context cannot be replayed in another (a future
// verification-email token, for instance, uses the same table with a
// different purpose).
export type ConsentPurpose = 'parental_consent';

export interface CreatedConsent {
  consentId: string;
  token: string;
  expiresAt: Date;
}

/**
 * Issue a fresh consent request for a child profile. Every prior pending
 * token for the same child atomically expires in the same transaction.
 */
export async function createConsentRequest(
  childProfileId: string,
  parentEmail: string,
): Promise<CreatedConsent> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + CONSENT_TTL_MS);
  const consentId = randomUUID();

  await withTransaction(async (connection) => {
    // Sibling invalidation MUST happen inside the same transaction as the
    // new row — otherwise a race between two resends could leave two
    // "pending" rows and confuse the state machine.
    await connection.execute(
      "UPDATE parental_consents SET status = 'expired' WHERE child_profile_id = ? AND status = 'pending'",
      [childProfileId],
    );
    await connection.execute(
      `INSERT INTO parental_consents (id, child_profile_id, parent_email, token_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        consentId,
        childProfileId,
        parentEmail.trim().toLowerCase(),
        hashToken(token),
        expiresAt,
      ],
    );
  });

  return { consentId, token, expiresAt };
}

// Public state view used by API responses. Never contains a token; the
// child's UI only ever sees the state and (when applicable) the earliest
// time a resend is allowed.
export interface ConsentStatus {
  state: ConsentState;
  parentEmail: string | null;
  canResendAt: Date | null;
  updatedAt: Date | null;
}

const RESEND_ELIGIBLE_STATES: ReadonlySet<string> = new Set(['pending', 'expired']);

export async function loadConsentStatus(childProfileId: string): Promise<ConsentStatus> {
  const record = await queryOne<{
    status: string;
    parent_email: string;
    created_at: Date;
    responded_at: Date | null;
    expires_at: Date;
  }>(
    `SELECT status, parent_email, created_at, responded_at, expires_at
       FROM parental_consents
      WHERE child_profile_id = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    [childProfileId],
  );

  if (!record) {
    return { state: 'not_required', parentEmail: null, canResendAt: null, updatedAt: null };
  }

  const now = Date.now();
  // Lazily promote a `pending` row past its 24-hour window to `expired`
  // in the returned view (the DB row is only rewritten by the resend
  // path or the resolve path — same-source-of-truth rule).
  const derivedState: ConsentState =
    record.status === 'pending' && new Date(record.expires_at).getTime() < now
      ? 'expired'
      : (record.status as ConsentState);

  const canResendAt =
    RESEND_ELIGIBLE_STATES.has(derivedState) || derivedState === 'expired'
      ? new Date(new Date(record.created_at).getTime() + RESEND_COOLDOWN_MS)
      : null;

  return {
    state: derivedState,
    parentEmail: record.parent_email,
    canResendAt,
    updatedAt: record.responded_at ?? record.created_at,
  };
}

export type ConsentDecision = 'granted' | 'denied';

export type ConsentOutcome =
  | { ok: true; childProfileId: string; decision: ConsentDecision }
  | { ok: false; reason: 'not-found' | 'expired' | 'already-answered' };

/**
 * Grant or deny consent by raw token. Single use; the decision + profile
 * permissions are written atomically so the two cannot diverge.
 *
 * Sibling tokens for the same child (older or newer resends) are
 * atomically expired — the parent's decision closes the whole child's
 * outstanding token set so a leaked older link cannot be replayed.
 */
export async function resolveConsent(
  token: string,
  decision: ConsentDecision,
): Promise<ConsentOutcome> {
  const record = await queryOne<{
    id: string;
    child_profile_id: string;
    status: string;
    expires_at: Date;
  }>(
    `SELECT id, child_profile_id, status, expires_at
       FROM parental_consents WHERE token_hash = ?`,
    [hashToken(token)],
  );

  if (!record) return { ok: false, reason: 'not-found' };
  if (record.status !== 'pending') return { ok: false, reason: 'already-answered' };
  if (new Date(record.expires_at).getTime() < Date.now()) {
    // Do not roll the DB status to `expired` outside the transaction —
    // the transactional resolve below is the only place a `pending` row
    // legitimately transitions.
    await withTransaction(async (connection) => {
      await connection.execute(
        "UPDATE parental_consents SET status = 'expired' WHERE id = ? AND status = 'pending'",
        [record.id],
      );
    });
    return { ok: false, reason: 'expired' };
  }

  await withTransaction(async (connection) => {
    // Sibling invalidation: any other pending token for the same child
    // becomes 'expired' in the same transaction. Prevents a resend
    // handed out just before the parent clicked from being reusable.
    await connection.execute(
      "UPDATE parental_consents SET status = 'expired' WHERE child_profile_id = ? AND status = 'pending' AND id <> ?",
      [record.child_profile_id, record.id],
    );

    await connection.execute(
      'UPDATE parental_consents SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?',
      [decision, record.id],
    );

    // Profile permissions ride the same transaction. Grant unlocks
    // sharing / publishing; denial pins the child at private editing.
    // Note: `parental_approval_at` is a data-audit marker for the
    // moment the flag flipped, not a security-relevant field.
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

  return { ok: true, childProfileId: record.child_profile_id, decision };
}

export type ResendOutcome =
  | { ok: true; child: CreatedConsent; parentEmail: string }
  | { ok: false; reason: 'no-record' | 'cooldown' | 'already-answered' };

/**
 * Reissue a consent token to the same parent email as the last request.
 * Rate-limited server-side by `RESEND_COOLDOWN_MS`. A resend expires the
 * previous token in the same transaction the new one is minted.
 *
 * The child never sees the returned token — this function is called by
 * the resend route which delivers the new link through the same email
 * transport as the original.
 */
export async function resendConsentRequest(childProfileId: string): Promise<ResendOutcome> {
  const status = await loadConsentStatus(childProfileId);
  if (status.state === 'not_required' || !status.parentEmail) {
    return { ok: false, reason: 'no-record' };
  }
  if (status.state === 'granted' || status.state === 'denied') {
    return { ok: false, reason: 'already-answered' };
  }
  if (status.canResendAt && status.canResendAt.getTime() > Date.now()) {
    return { ok: false, reason: 'cooldown' };
  }

  const created = await createConsentRequest(childProfileId, status.parentEmail);
  return { ok: true, child: created, parentEmail: status.parentEmail };
}
