const assert = require('node:assert/strict');
const test = require('node:test');
const {
  pseudonymizeActor,
  serializeAuditEvent,
} = require('../.build/lib/safety/audit');

const SECRET = 'test-secret-for-audit-hmac';
const OTHER_SECRET = 'different-secret';
const FIXED_NOW = () => new Date('2026-08-19T00:00:00.000Z');

function baseEvent(overrides = {}) {
  return {
    actorKind: 'user',
    actorKey: 'user-abc-123',
    operation: 'test.operation',
    outcome: 'allowed',
    ...overrides,
  };
}

test('pseudonymizeActor is deterministic for the same key and secret', () => {
  const a = pseudonymizeActor('actor-1', SECRET);
  const b = pseudonymizeActor('actor-1', SECRET);
  assert.equal(a, b);
  assert.equal(a.length, 32);
  assert.match(a, /^[0-9a-f]{32}$/);
});

test('pseudonymizeActor produces different digests for different actors', () => {
  const a = pseudonymizeActor('actor-1', SECRET);
  const b = pseudonymizeActor('actor-2', SECRET);
  assert.notEqual(a, b);
});

test('pseudonymizeActor is secret-scoped — different secret rotates the pseudonym', () => {
  const a = pseudonymizeActor('actor-1', SECRET);
  const b = pseudonymizeActor('actor-1', OTHER_SECRET);
  assert.notEqual(a, b);
});

test('pseudonymizeActor rejects an empty secret', () => {
  assert.throws(() => pseudonymizeActor('actor-1', ''), /non-empty secret/);
});

test('serialized event carries the pseudonym instead of the raw actor key', () => {
  const event = serializeAuditEvent(baseEvent(), { secret: SECRET, now: FIXED_NOW });
  assert.equal(event.actorPseudonym, pseudonymizeActor('user-abc-123', SECRET));
  assert.equal(JSON.stringify(event).includes('user-abc-123'), false);
});

test('serialized event pins occurredAt via the injected clock', () => {
  const event = serializeAuditEvent(baseEvent(), { secret: SECRET, now: FIXED_NOW });
  assert.equal(event.occurredAt, '2026-08-19T00:00:00.000Z');
});

test('caller-supplied occurredAt overrides the clock', () => {
  const event = serializeAuditEvent(
    baseEvent({ occurredAt: new Date('2026-01-01T00:00:00.000Z') }),
    { secret: SECRET, now: FIXED_NOW },
  );
  assert.equal(event.occurredAt, '2026-01-01T00:00:00.000Z');
});

test('sensitive attribute names are dropped entirely', () => {
  const event = serializeAuditEvent(
    baseEvent({
      attributes: {
        userEmail: 'child@example.com',
        parentEmail: 'parent@example.com',
        promptBody: 'the raw prompt the AI saw',
        password: 'hunter2',
        secretKey: 'sk_live_abc',
        ipAddress: '203.0.113.7',
        forwardedFor: '203.0.113.7, 10.0.0.1',
        sessionToken: 'abcdef',
        actorId: 'internal-id',
        userId: 'internal-id',
        birthDate: '2015-01-01',
        dob: '2015-01-01',
        title: 'My Game',
        messageBody: 'hello',
        recordingUrl: 'https://s3/.../rec.mp3',
        uploadPath: 'private/user-xyz.png',
      },
    }),
    { secret: SECRET, now: FIXED_NOW },
  );
  assert.deepEqual(event.attributes, {}, 'every sensitive key must be stripped');
  const raw = JSON.stringify(event);
  assert.equal(raw.includes('child@example.com'), false);
  assert.equal(raw.includes('parent@example.com'), false);
  assert.equal(raw.includes('the raw prompt'), false);
  assert.equal(raw.includes('hunter2'), false);
  assert.equal(raw.includes('203.0.113.7'), false);
});

test('safe attribute names pass through', () => {
  const event = serializeAuditEvent(
    baseEvent({
      attributes: {
        projectRevision: 42,
        sceneCount: 3,
        limitBucket: 'per_ip_5m',
        wasFirstAttempt: true,
        featureFlag: 'ai_creation',
        contentType: 'image/png',
        profileKind: 'guest',
        tokenHash: 'abc123',
      },
    }),
    { secret: SECRET, now: FIXED_NOW },
  );
  assert.deepEqual(event.attributes, {
    projectRevision: 42,
    sceneCount: 3,
    limitBucket: 'per_ip_5m',
    wasFirstAttempt: true,
    featureFlag: 'ai_creation',
    contentType: 'image/png',
    profileKind: 'guest',
    tokenHash: 'abc123',
  });
});

test('sensitive-looking string values are replaced with [redacted]', () => {
  const event = serializeAuditEvent(
    baseEvent({
      attributes: {
        // Legitimate field names but the values themselves are PII.
        reasonNote: 'delivered to child@example.com',
        detail: 'client 198.51.100.7 exceeded quota',
        traceHint: 'aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb.cccccccccccccccc',
      },
    }),
    { secret: SECRET, now: FIXED_NOW },
  );
  assert.equal(event.attributes.reasonNote, '[redacted]');
  assert.equal(event.attributes.detail, '[redacted]');
  assert.equal(event.attributes.traceHint, '[redacted]');
});

test('correlationId and reason default to null and pass through when supplied', () => {
  const minimal = serializeAuditEvent(baseEvent(), { secret: SECRET, now: FIXED_NOW });
  assert.equal(minimal.reason, null);
  assert.equal(minimal.correlationId, null);

  const full = serializeAuditEvent(
    baseEvent({ reason: 'quota_exceeded', correlationId: 'req_abc123' }),
    { secret: SECRET, now: FIXED_NOW },
  );
  assert.equal(full.reason, 'quota_exceeded');
  assert.equal(full.correlationId, 'req_abc123');
});

test('outcome and actor kind are wire-fixed enumerations', () => {
  const denied = serializeAuditEvent(
    baseEvent({ actorKind: 'guest', outcome: 'denied' }),
    { secret: SECRET, now: FIXED_NOW },
  );
  assert.equal(denied.outcome, 'denied');
  assert.equal(denied.actorKind, 'guest');
});
