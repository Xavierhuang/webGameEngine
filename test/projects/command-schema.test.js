const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ProjectCommandSchema,
  ProjectCommandEnvelopeSchema,
  CommandErrorCodes,
} = require('../.build/lib/projects/commandSchema');

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = 'idem-1234567890abcdef';
const SESSION = '33333333-3333-4333-8333-333333333333';

function envelope(command, overrides = {}) {
  return {
    expectedRevision: 0,
    idempotencyKey: IDEMPOTENCY_KEY,
    editingSessionId: SESSION,
    groupId: 'group-1',
    command,
    ...overrides,
  };
}

test('discriminated union accepts every known command type', () => {
  const commands = [
    { type: 'project.updateMetadata', title: 'New title' },
    { type: 'scene.create', sceneId: UUID, name: 'Main scene' },
    { type: 'scene.update', sceneId: UUID, name: 'Renamed' },
    { type: 'scene.delete', sceneId: UUID },
    { type: 'scene.reorder', sceneIds: [UUID, UUID_B] },
    { type: 'object.create', objectId: UUID, sceneId: UUID_B, name: 'Player', objectType: 'character' },
    { type: 'object.update', objectId: UUID, name: 'Player 2' },
    { type: 'object.delete', objectId: UUID },
    { type: 'object.reorder', sceneId: UUID_B, objectIds: [UUID] },
    { type: 'object.blocks.replace', objectId: UUID, workspaceJson: { blocks: [] } },
  ];
  for (const command of commands) {
    const parsed = ProjectCommandSchema.safeParse(command);
    assert.ok(parsed.success, `${command.type} unexpectedly rejected: ${JSON.stringify(parsed.error?.issues)}`);
  }
});

test('unknown command type is rejected', () => {
  const parsed = ProjectCommandSchema.safeParse({ type: 'project.destroyAllHumans' });
  assert.equal(parsed.success, false);
});

test('unknown fields on a command payload are rejected', () => {
  const parsed = ProjectCommandSchema.safeParse({
    type: 'scene.create',
    sceneId: UUID,
    name: 'Main',
    smuggled: 'admin=true',
  });
  assert.equal(parsed.success, false, 'strict payloads must reject extra keys');
});

test('empty updateMetadata is rejected — must change at least one field', () => {
  const parsed = ProjectCommandSchema.safeParse({ type: 'project.updateMetadata' });
  assert.equal(parsed.success, false);
});

test('empty scene.update is rejected — must change at least one field', () => {
  const parsed = ProjectCommandSchema.safeParse({ type: 'scene.update', sceneId: UUID });
  assert.equal(parsed.success, false);
});

test('empty object.update is rejected — must change at least one field', () => {
  const parsed = ProjectCommandSchema.safeParse({ type: 'object.update', objectId: UUID });
  assert.equal(parsed.success, false);
});

test('object model URLs must use Lingplay storage or the approved AI model host', () => {
  const base = {
    type: 'object.create',
    objectId: UUID,
    sceneId: UUID_B,
    name: 'Hero',
    objectType: 'character',
  };

  assert.equal(ProjectCommandSchema.safeParse({ ...base, properties: { modelUrl: '/uploads/models/hero.glb' } }).success, true);
  assert.equal(ProjectCommandSchema.safeParse({ ...base, properties: { model_url: 'https://assets.meshy.ai/models/hero.glb' } }).success, true);
  assert.equal(ProjectCommandSchema.safeParse({ ...base, properties: { modelUrl: 'https://untrusted.example/hero.glb' } }).success, false);
  assert.equal(ProjectCommandSchema.safeParse({ ...base, properties: { sprite_data: { model_url: 'https://untrusted.example/hero.glb' } } }).success, false);
  assert.equal(ProjectCommandSchema.safeParse({ ...base, properties: { costumes: [{ model_url: 'https://untrusted.example/hero.glb' }] } }).success, false);
});

test('invalid UUIDs are rejected', () => {
  const parsed = ProjectCommandSchema.safeParse({
    type: 'scene.delete',
    sceneId: 'not-a-uuid',
  });
  assert.equal(parsed.success, false);
});

test('scene.reorder rejects an empty list', () => {
  const parsed = ProjectCommandSchema.safeParse({ type: 'scene.reorder', sceneIds: [] });
  assert.equal(parsed.success, false);
});

test('invalid colors on scene.create are rejected', () => {
  const parsed = ProjectCommandSchema.safeParse({
    type: 'scene.create',
    sceneId: UUID,
    name: 'Main',
    backgroundColor: 'not a color',
  });
  assert.equal(parsed.success, false);
});

test('object.blocks.replace enforces the 2 MiB byteSize ceiling', () => {
  const parsed = ProjectCommandSchema.safeParse({
    type: 'object.blocks.replace',
    objectId: UUID,
    workspaceJson: {},
    byteSize: 4 * 1024 * 1024,
  });
  assert.equal(parsed.success, false);
});

test('envelope requires the concurrency, idempotency, and grouping metadata', () => {
  const parsed = ProjectCommandEnvelopeSchema.safeParse({
    command: { type: 'scene.delete', sceneId: UUID },
  });
  assert.equal(parsed.success, false);
});

test('envelope idempotencyKey has a minimum length so it can carry entropy', () => {
  const parsed = ProjectCommandEnvelopeSchema.safeParse(
    envelope({ type: 'scene.delete', sceneId: UUID }, { idempotencyKey: 'short' }),
  );
  assert.equal(parsed.success, false);
});

test('envelope rejects a client-supplied inverse — inverses are server-computed', () => {
  const parsed = ProjectCommandEnvelopeSchema.safeParse(
    envelope(
      { type: 'scene.delete', sceneId: UUID },
      { inverse: { type: 'scene.create', sceneId: UUID, name: 'Undo' } },
    ),
  );
  assert.equal(
    parsed.success,
    false,
    'envelope must be .strict() — a smuggled inverse would let clients replay authorized undo ops',
  );
});

test('expectedRevision must be a non-negative integer when provided', () => {
  const parsed = ProjectCommandEnvelopeSchema.safeParse(
    envelope({ type: 'scene.delete', sceneId: UUID }, { expectedRevision: -1 }),
  );
  assert.equal(parsed.success, false);
});

test('expectedRevision is optional — no-precondition writes are legal', () => {
  const parsed = ProjectCommandEnvelopeSchema.safeParse({
    idempotencyKey: IDEMPOTENCY_KEY,
    editingSessionId: SESSION,
    groupId: 'group-1',
    command: { type: 'scene.delete', sceneId: UUID },
  });
  assert.equal(parsed.success, true);
});

test('command error codes match the wire contract', () => {
  assert.deepEqual(CommandErrorCodes, {
    RevisionConflict: 'revision_conflict',
    IdempotencyMismatch: 'idempotency_mismatch',
    ValidationFailed: 'validation_failed',
    ForbiddenType: 'forbidden_type',
    HandlerFailed: 'handler_failed',
  });
});
