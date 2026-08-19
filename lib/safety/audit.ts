import { createHmac } from 'crypto';

/**
 * Redacted safety audit events.
 *
 * Every safety-relevant server operation (moderation decisions, rate-limit
 * breaches, capability denials, admin actions) is expected to emit an
 * `AuditEvent`. The serializer here fixes the *only* shape that reaches
 * long-term storage so an audit log cannot inadvertently retain the raw
 * user content that triggered the event.
 *
 * The plan's global constraints spell out what may NEVER land in an audit
 * event: birth dates, emails, raw IPs, prompts, dialogue, titles,
 * recordings, uploads, and direct actor IDs. This module enforces those
 * rules by refusing to serialize any field name that matches known
 * sensitive keys — even if a caller mistakenly passes one — and by
 * pseudonymizing the actor via HMAC(secret, actorKey) so a leaked audit
 * table cannot be reversed to a real profile without also having the
 * server-side secret.
 *
 * Keep the sensitive-key list conservative: adding a false positive to
 * the deny list is cheap (one legitimate field forced through a safer
 * name); missing a real sensitive key is expensive (raw PII in the
 * audit log forever).
 */

export type AuditActorKind =
  | 'user'
  | 'guest'
  | 'admin'
  | 'moderator'
  | 'system'
  | 'anonymous';

export type AuditOutcome = 'allowed' | 'denied' | 'error';

// Runtime shape a caller passes to `serializeAuditEvent`. The `actorKey`
// is a raw identifier (user id, guest session id, IP hash) that will be
// pseudonymized before serialization; callers never store it directly.
export interface AuditEvent {
  actorKind: AuditActorKind;
  actorKey: string;
  operation: string;
  outcome: AuditOutcome;
  reason?: string;
  correlationId?: string;
  occurredAt?: Date;
  // Optional structured attributes attached to the event. Any key on this
  // record whose *name* matches a known sensitive field is dropped by the
  // serializer, and any string value is checked against sensitive-value
  // heuristics as a second line of defense.
  attributes?: Record<string, string | number | boolean | null>;
}

// The single serialized shape that lands in `security_audit_events` and
// operational log sinks. Never contains the raw `actorKey`; the caller-
// facing `actorKey` becomes `actorPseudonym` (HMAC-SHA-256 hex, first 32
// chars) after `serializeAuditEvent` runs.
export interface SerializedAuditEvent {
  actorKind: AuditActorKind;
  actorPseudonym: string;
  operation: string;
  outcome: AuditOutcome;
  reason: string | null;
  correlationId: string | null;
  occurredAt: string;
  attributes: Record<string, string | number | boolean | null>;
}

// Field-name deny list. Matches are case-insensitive and check for the
// substring, so `user_email`, `parentEmail`, and `EmailAddress` all get
// stripped. Prefer over-broad matches here: dropping one legitimate
// attribute is cheaper than leaking one raw email.
const SENSITIVE_FIELD_NAMES: readonly RegExp[] = [
  /email/i,
  /prompt/i,
  /dialogue/i,
  /title/i,
  /body/i,
  /content(?!_?type)/i, // allow content_type / contentType; block content, contentBody, etc.
  /message/i,
  /recording/i,
  /upload/i,
  /token(?!_?hash)/i, // allow token_hash / tokenHash (already-hashed); block raw token, tokenValue
  /password/i,
  /secret/i,
  /birth/i,
  /\bdob\b/i,
  /\bip\b/i,
  /ipaddress/i,
  /useragent/i,
  /forwardedfor/i,
  /session(?!kind)/i, // allow sessionKind; block sessionId, sessionToken
  /profile(?!kind)/i, // allow profileKind; block profileId, profileEmail
  /actorid/i, // direct actor IDs are banned per the plan; use actorPseudonym
  /userid/i,
];

// Value heuristics: even if a field name passes the deny list, a string
// value that clearly looks like PII gets replaced with `[redacted]`. Used
// as a defense-in-depth backstop.
const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  // Any email-shaped value.
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  // IPv4 address.
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  // Bearer/JWT tokens (three dot-separated base64url chunks).
  /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
];

const REDACTED = '[redacted]';

// Derive a stable pseudonym from `actorKey` using HMAC-SHA-256 keyed by
// `secret`. First 32 hex chars of the digest are enough entropy for a
// per-project bucket key and short enough to fit table indexes. Callers
// pass the server-side audit secret (never the request-scoped session
// secret) so the pseudonym is stable across sessions of the same actor
// but opaque to anyone who does not have that secret.
export function pseudonymizeActor(actorKey: string, secret: string): string {
  if (!secret) {
    throw new Error('pseudonymizeActor requires a non-empty secret');
  }
  const digest = createHmac('sha256', secret).update(actorKey).digest('hex');
  return digest.slice(0, 32);
}

function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_FIELD_NAMES.some((pattern) => pattern.test(name));
}

function isSensitiveStringValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeAttribute(
  value: string | number | boolean | null,
): string | number | boolean | null {
  if (typeof value === 'string' && isSensitiveStringValue(value)) {
    return REDACTED;
  }
  return value;
}

function sanitizeAttributes(
  attributes: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> {
  if (!attributes) return {};
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (isSensitiveFieldName(name)) continue;
    clean[name] = sanitizeAttribute(value);
  }
  return clean;
}

export interface SerializeAuditOptions {
  secret: string;
  // Injectable clock so tests can pin `occurredAt` deterministically.
  now?: () => Date;
}

export function serializeAuditEvent(
  event: AuditEvent,
  options: SerializeAuditOptions,
): SerializedAuditEvent {
  const now = options.now ?? (() => new Date());
  return {
    actorKind: event.actorKind,
    actorPseudonym: pseudonymizeActor(event.actorKey, options.secret),
    operation: event.operation,
    outcome: event.outcome,
    reason: event.reason ?? null,
    correlationId: event.correlationId ?? null,
    occurredAt: (event.occurredAt ?? now()).toISOString(),
    attributes: sanitizeAttributes(event.attributes),
  };
}
