import { randomUUID } from 'crypto';
import { query } from '../mysql/server';
import {
  serializeAuditEvent,
  type AuditActorKind,
  type AuditOutcome,
} from '../safety/audit';

/**
 * The release workflow never writes free text to the security log. These
 * event names and result codes are intentionally small, stable identifiers.
 */
export type ReleaseAuditOperation =
  | 'world_release.submitted'
  | 'world_release.decision'
  | 'world_release.withdrawn'
  | 'world_release.taken_down';

export interface ReleaseAuditEvent {
  actorKind: AuditActorKind;
  actorKey: string;
  operation: ReleaseAuditOperation;
  outcome: AuditOutcome;
  reason: string;
  attributes?: Record<string, string | number | boolean | null>;
}

export interface ReleaseAuditOptions {
  /** Test seam; production uses the server database helper. */
  query?: typeof query;
  /** Must be a server secret; it is never returned to callers. */
  secret?: string;
  now?: () => Date;
  uuid?: () => string;
}

function storedActorKind(kind: AuditActorKind): 'user' | 'guest' | 'anonymous' | 'system' {
  // The existing durable table predates moderator/admin actor kinds. Their
  // request identity is still pseudonymized, while the operation field keeps
  // the action distinguishable without migrating a raw staff identifier.
  if (kind === 'user' || kind === 'guest' || kind === 'anonymous') return kind;
  return 'system';
}

/**
 * Persist a redacted, pseudonymized audit receipt. The legacy audit table has
 * no JSON column, deliberately so: only the operation/outcome/reason code
 * cross this boundary. Callers run this after their release transaction has
 * committed, never as a substitute for the state authority.
 */
export async function writeReleaseAudit(
  event: ReleaseAuditEvent,
  options: ReleaseAuditOptions = {},
): Promise<void> {
  const secret = options.secret ?? process.env.AUDIT_HMAC_SECRET;
  if (!secret) throw new Error('Release audit requires AUDIT_HMAC_SECRET');

  const serialized = serializeAuditEvent(event, { secret, now: options.now });
  const runQuery = options.query ?? query;
  await runQuery(
    `INSERT INTO security_audit_events
       (id, actor_kind, actor_id, operation, outcome, reason_code, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      (options.uuid ?? randomUUID)(),
      storedActorKind(serialized.actorKind),
      serialized.actorPseudonym,
      serialized.operation,
      serialized.outcome,
      serialized.reason,
      serialized.correlationId,
    ],
  );
}
