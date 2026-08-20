import { z } from 'zod';

/**
 * Project command wire schema.
 *
 * Every mutating write to a project — metadata, scenes, objects, block
 * workspaces — flows through the command service as one of these envelopes.
 * The service is the only writer; every route hands the envelope to it and
 * receives back `{ commandId, revision, result }`.
 *
 * Strictness rules baked into the schema:
 * - Discriminated union on `type` so unknown command kinds fail fast at the
 *   validation boundary, not at runtime inside a transaction.
 * - `.strict()` on every payload so callers cannot smuggle extra keys past
 *   validation and rely on server-side ignore behavior.
 * - `command` never carries a client-supplied inverse or diff — the server
 *   computes the inverse from the pre/post state under the same transaction.
 *   A client-supplied inverse would let a well-formed but malicious client
 *   replay authorized undo operations against another user's project.
 *
 * The envelope layer (`ProjectCommandEnvelope`) records the concurrency and
 * retry contract:
 * - `expectedRevision` implements If-Match optimistic locking — the service
 *   asserts this equals the project's current revision inside the transaction
 *   and returns 409 `revision_conflict` on mismatch.
 * - `idempotencyKey` scoped to the project (via URL) makes the write
 *   single-writer: a duplicate envelope returns the stored `result_json`
 *   from `project_commands` instead of re-executing the command.
 * - `editingSessionId` + `groupId` group commands into one undo entry
 *   (matches Blockly `event.group`). One editing session owns many
 *   commands; one group owns the commands emitted between two user pauses.
 */

// Shared primitives ---------------------------------------------------------

const UUID = z.string().uuid();

// Non-empty string with an upper bound. Titles, names, and short-form user
// input all use this so a runaway paste cannot balloon a JSON row.
const ShortText = (max: number) => z.string().min(1).max(max);

// Colors accept `#rgb`, `#rrggbb`, or `rgb()`/`rgba()`. The player's own
// rendering pipeline treats invalid colors as `#87CEEB`, but the schema
// rejects unknown forms so the audit log stays honest.
const CssColor = z
  .string()
  .max(64)
  .regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]{1,64}\))$/, 'invalid CSS color');

const Url = z.string().url().max(2048);

// Numeric ranges — the runtime asserts these too, but rejecting at the
// command boundary means garbage never enters `project_commands.command_json`.
const Coord = z.number().finite();
const OrderIndex = z.number().int().min(0).max(1_000_000);
const NonNegativeInt = z.number().int().min(0);

// Command payloads ----------------------------------------------------------

const ProjectMetadataUpdate = z
  .object({
    type: z.literal('project.updateMetadata'),
    title: ShortText(120).optional(),
    description: z.string().max(2_000).nullable().optional(),
    thumbnailUrl: Url.nullable().optional(),
    genre: ShortText(64).nullable().optional(),
    visibility: z.enum(['private', 'shared', 'public']).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.thumbnailUrl !== undefined ||
      v.genre !== undefined ||
      v.visibility !== undefined,
    { message: 'updateMetadata requires at least one field to change' },
  );

const SceneCreate = z
  .object({
    type: z.literal('scene.create'),
    sceneId: UUID,
    name: ShortText(120),
    backgroundColor: CssColor.optional(),
    backgroundImageUrl: Url.nullable().optional(),
  })
  .strict();

const SceneUpdate = z
  .object({
    type: z.literal('scene.update'),
    sceneId: UUID,
    name: ShortText(120).optional(),
    backgroundColor: CssColor.optional(),
    backgroundImageUrl: Url.nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.name !== undefined || v.backgroundColor !== undefined || v.backgroundImageUrl !== undefined,
    { message: 'scene.update requires at least one field to change' },
  );

const SceneDelete = z
  .object({
    type: z.literal('scene.delete'),
    sceneId: UUID,
  })
  .strict();

const SceneReorder = z
  .object({
    type: z.literal('scene.reorder'),
    // Exhaustive: the full ordered list of scene IDs, no gaps, no partial.
    // Reordering by subset would let the service silently drop scenes.
    sceneIds: z.array(UUID).min(1).max(500),
  })
  .strict();

const Vec3 = z.object({ x: Coord, y: Coord, z: Coord }).strict();

// `.passthrough()` rather than `.strict()`: the object-add pickers
// (character/collectible/obstacle/sound) each carry a picker-specific
// metadata bag (characterType, collectibleType, obstacleType, soundType,
// beat/bpm/autoplay_beat, model_url/thumbnail_url/model_bounds/model_origin_offset)
// that is not enumerable from this file. handleObjectCreate JSON-stringifies
// whatever it receives into the `properties` column and only reads its own
// named fields, so unknown keys have no code path — they become opaque
// per-object metadata the renderer picks up. Strict rejection here forced
// every new picker field to go through this schema, which caused a silent
// 422 regression when the legacy /api/ai/apply-update path was retired and
// clients started sending their real metadata through the command service.
const ObjectProperties = z
  .object({
    position: Vec3.optional(),
    rotation: Vec3.optional(),
    scale: Vec3.optional(),
    color: CssColor.optional(),
    shape: z
      .enum([
        'box',
        'sphere',
        'cylinder',
        'cone',
        'pyramid',
        'torus',
        'capsule',
        'plane',
        'model',
        'circle',
      ])
      .optional(),
    // ModelPath accepts relative paths ("/models/foo.glb") as well as
    // absolute URLs — prefabs and uploads both take the relative form.
    modelUrl: z.string().min(1).max(2048).nullable().optional(),
    // Runtime numeric limits — see plan's global-constraint list. Rejecting at
    // the command layer keeps the transaction short and the failure precise.
    mass: z.number().nonnegative().max(1e6).optional(),
    friction: z.number().min(0).max(100).optional(),
    restitution: z.number().min(0).max(100).optional(),
    // Common picker-visual fields, typed so their intent is documented even
    // though `.passthrough()` would accept them anyway.
    size: z.number().min(0).max(10000).optional(),
    characterType: ShortText(120).optional(),
    collectibleType: ShortText(120).optional(),
    obstacleType: ShortText(120).optional(),
    soundType: ShortText(120).optional(),
    thumbnailUrl: z.string().min(1).max(2048).nullable().optional(),
    // Snake-case aliases the pickers historically emit. Kept alongside the
    // camelCase form because the JSON column already stores the snake shape.
    model_url: z.string().min(1).max(2048).nullable().optional(),
    thumbnail_url: z.string().min(1).max(2048).nullable().optional(),
    model_bounds: z.object({ min: Vec3, max: Vec3 }).passthrough().optional(),
    model_origin_offset: Vec3.optional(),
  })
  .passthrough();

const ObjectCreate = z
  .object({
    type: z.literal('object.create'),
    objectId: UUID,
    sceneId: UUID,
    name: ShortText(120),
    objectType: z.enum(['character', 'platform', 'collectible', 'obstacle', 'sprite', 'sound']),
    properties: ObjectProperties.optional(),
  })
  .strict();

const ObjectUpdate = z
  .object({
    type: z.literal('object.update'),
    objectId: UUID,
    name: ShortText(120).optional(),
    properties: ObjectProperties.optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.properties !== undefined, {
    message: 'object.update requires at least one field to change',
  });

const ObjectDelete = z
  .object({
    type: z.literal('object.delete'),
    objectId: UUID,
  })
  .strict();

const ObjectReorder = z
  .object({
    type: z.literal('object.reorder'),
    sceneId: UUID,
    objectIds: z.array(UUID).min(1).max(2_000),
  })
  .strict();

const ObjectBlocksReplace = z
  .object({
    type: z.literal('object.blocks.replace'),
    objectId: UUID,
    // Blockly workspace JSON. Kept opaque here because the block schema lives
    // in `lib/blockly/serializer.ts`; the handler will re-validate against
    // the workspace schema before persisting.
    workspaceJson: z.unknown(),
    // Coarse limit — a real workspace is well under this. The 5,000-block
    // per-project ceiling from the plan is enforced downstream, but this
    // 2 MiB byte-cap rejects an obvious DoS at the command boundary.
    byteSize: NonNegativeInt.max(2 * 1024 * 1024).optional(),
  })
  .strict();

// Discriminated union -------------------------------------------------------

// Uses `z.union` rather than `z.discriminatedUnion` so members that carry a
// `.refine()` (which wraps the ZodObject in a ZodEffects) can participate.
// The `type` literal on every member still gives TypeScript exhaustive
// discrimination on the inferred union — the perf difference for a 10-arm
// union at request scope is not measurable and the readability of keeping
// each command's business rule next to its shape is worth it.
export const ProjectCommandSchema = z.union([
  ProjectMetadataUpdate,
  SceneCreate,
  SceneUpdate,
  SceneDelete,
  SceneReorder,
  ObjectCreate,
  ObjectUpdate,
  ObjectDelete,
  ObjectReorder,
  ObjectBlocksReplace,
]);

export type ProjectCommand = z.infer<typeof ProjectCommandSchema>;
export type ProjectCommandType = ProjectCommand['type'];

// Envelope ------------------------------------------------------------------

export const ProjectCommandEnvelopeSchema = z
  .object({
    // Optional at first call: undefined means "no precondition, accept the
    // current revision" — used by rare admin tools. Client editors always
    // send the last acknowledged revision.
    expectedRevision: z.number().int().nonnegative().optional(),
    idempotencyKey: z.string().min(16).max(128),
    editingSessionId: UUID,
    groupId: z.string().min(1).max(128),
    command: ProjectCommandSchema,
  })
  .strict();

export type ProjectCommandEnvelope = z.infer<typeof ProjectCommandEnvelopeSchema>;

export const ProjectCommandResultSchema = z
  .object({
    commandId: UUID,
    revision: z.number().int().nonnegative(),
    result: z.unknown().optional(),
  })
  .strict();

export type ProjectCommandResult = z.infer<typeof ProjectCommandResultSchema>;

// Well-known error codes returned by the command service ---------------------
// Callers switch on these; they are part of the wire contract.
export const CommandErrorCodes = {
  RevisionConflict: 'revision_conflict',
  IdempotencyMismatch: 'idempotency_mismatch',
  ValidationFailed: 'validation_failed',
  ForbiddenType: 'forbidden_type',
  HandlerFailed: 'handler_failed',
} as const;

export type CommandErrorCode = (typeof CommandErrorCodes)[keyof typeof CommandErrorCodes];
