/**
 * Project command orchestrator.
 *
 * Every mutating project write flows through `executeProjectCommand`. The
 * plan spells out five invariants the orchestrator alone owns:
 *
 *   1. One transaction per command. `withTransaction` wraps the whole
 *      pipeline — `SELECT ... FOR UPDATE` on the project row, idempotency
 *      lookup, revision compare, handler dispatch, and the write to
 *      `project_commands` + `projects.revision` all commit together or
 *      not at all.
 *
 *   2. `SELECT ... FOR UPDATE` on `projects` at the top serializes
 *      concurrent writers against the same project. Two racing envelopes
 *      that arrive at revision R do not both apply — the second one wakes
 *      up after the first commits, re-reads `projects.revision`, sees R+1,
 *      and fails its `expected_revision` check with 409.
 *
 *   3. Idempotency is `(project_id, idempotency_key)` unique. A retry of
 *      the same envelope returns the stored `result_json` from the
 *      earlier row instead of re-executing the handler. A retry with the
 *      same key but a different command payload is a client bug — return
 *      `idempotency_mismatch` rather than accidentally overwriting.
 *
 *   4. Inverses are server-computed. The handler returns the inverse; the
 *      service stores it. A client-supplied inverse would let a well-formed
 *      but malicious client replay authorized undo operations against
 *      another user's project.
 *
 *   5. Revision monotonicity. `projects.revision` increments by exactly
 *      one per successful command inside the same transaction so the play
 *      snapshot for revision R+1 always sees the just-committed state.
 */

import { randomUUID, createHash } from 'crypto';
import { z } from 'zod';
import {
  ProjectCommandEnvelopeSchema,
  CommandErrorCodes,
  type ProjectCommand,
  type ProjectCommandEnvelope,
} from './commandSchema';
import { commandHandlers, CommandHandlerError, type CommandActor } from './commandHandlers';
import {
  loadProjectSnapshot,
  hashProjectSnapshot,
  canonicalStringify,
} from './projectSnapshot';
import type { Pool } from 'mysql2/promise';
import { withTransaction, type TransactionConnection } from '../mysql/transaction';

export interface ExecuteCommandOptions {
  actor: CommandActor;
  projectId: string;
  envelope: unknown;
  pool?: Pool;
  now?: () => Date;
}

export interface CommandExecutionResult {
  commandId: string;
  revision: number;
  result: unknown;
  replayed: boolean;
}

// Wire-shaped error. The route serializes it into the response body; the
// distinct `code` values are the wire contract clients switch on.
export class CommandServiceError extends Error {
  constructor(
    public readonly code: (typeof CommandErrorCodes)[keyof typeof CommandErrorCodes],
    public readonly httpStatus: 400 | 403 | 404 | 409 | 422 | 500,
    message: string,
    public readonly attributes?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CommandServiceError';
  }
}

const COMMAND_EXPIRY_DAYS = 30;

function toMysqlDate(d: Date): string {
  // mysql2 accepts a `Date` directly, but forcing UTC ISO here keeps a
  // caller-supplied `now` deterministic in tests without wrestling with
  // driver-side timezone conversion.
  const pad = (n: number, width = 2) => n.toString().padStart(width, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

function commandContentHash(command: ProjectCommand): string {
  return createHash('sha256').update(canonicalStringify(command)).digest('hex');
}

async function loadProjectRevision(
  connection: TransactionConnection,
  projectId: string,
): Promise<number | null> {
  const [rows] = await connection.execute(
    'SELECT revision FROM projects WHERE id = ? FOR UPDATE',
    [projectId],
  );
  const list = rows as Array<{ revision: number | string }>;
  if (list.length === 0) return null;
  return Number(list[0].revision);
}

type IdempotencyLookup =
  | { kind: 'none' }
  | { kind: 'mismatch' }
  | { kind: 'replay'; commandId: string; revision: number; result: unknown };

async function loadIdempotentReplay(
  connection: TransactionConnection,
  projectId: string,
  idempotencyKey: string,
  envelopeHash: string,
): Promise<IdempotencyLookup> {
  const [rows] = await connection.execute(
    `SELECT id, command_sha256, result_json, applied_revision
       FROM project_commands
      WHERE project_id = ? AND idempotency_key = ?`,
    [projectId, idempotencyKey],
  );
  const list = rows as Array<{
    id: string;
    command_sha256: string;
    result_json: unknown;
    applied_revision: number | string | null;
  }>;
  if (list.length === 0) return { kind: 'none' };
  const prior = list[0];
  if (prior.command_sha256 !== envelopeHash) {
    return { kind: 'mismatch' };
  }
  return {
    kind: 'replay',
    commandId: prior.id,
    revision: prior.applied_revision === null ? -1 : Number(prior.applied_revision),
    result: prior.result_json,
  };
}

export async function executeProjectCommand(
  options: ExecuteCommandOptions,
): Promise<CommandExecutionResult> {
  const nowFn = options.now ?? (() => new Date());

  // Envelope parse happens OUTSIDE the transaction. A validation failure
  // must not open a connection, and a client that ships garbage should not
  // be able to wedge a pool slot.
  let envelope: ProjectCommandEnvelope;
  try {
    envelope = ProjectCommandEnvelopeSchema.parse(options.envelope);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new CommandServiceError(
        CommandErrorCodes.ValidationFailed,
        422,
        'Invalid command envelope',
        { issues: error.issues.slice(0, 32) },
      );
    }
    throw error;
  }

  const commandHash = commandContentHash(envelope.command);

  return withTransaction<CommandExecutionResult>(async (connection) => {
    const now = nowFn();
    const currentRevision = await loadProjectRevision(connection, options.projectId);
    if (currentRevision === null) {
      throw new CommandServiceError(
        CommandErrorCodes.ValidationFailed,
        404,
        `Project ${options.projectId} not found`,
      );
    }

    // Idempotency replay comes before revision check on purpose. A retry
    // of a successful earlier envelope stays successful even if a later
    // sibling command already advanced the revision past the one the
    // client remembered.
    const replay = await loadIdempotentReplay(
      connection,
      options.projectId,
      envelope.idempotencyKey,
      commandHash,
    );
    if (replay.kind === 'mismatch') {
      throw new CommandServiceError(
        CommandErrorCodes.IdempotencyMismatch,
        409,
        'idempotency_key was reused with a different command body',
      );
    }
    if (replay.kind === 'replay') {
      return {
        commandId: replay.commandId,
        revision: replay.revision >= 0 ? replay.revision : currentRevision,
        result: replay.result,
        replayed: true,
      };
    }

    if (
      envelope.expectedRevision !== undefined &&
      envelope.expectedRevision !== currentRevision
    ) {
      throw new CommandServiceError(
        CommandErrorCodes.RevisionConflict,
        409,
        `Expected revision ${envelope.expectedRevision} but project is at ${currentRevision}`,
        { currentRevision },
      );
    }

    const handler = commandHandlers[envelope.command.type];
    if (!handler) {
      // The union parse above already prevents this, but the exhaustive
      // dispatch table is defensively guarded so a missing handler is a
      // 500 with a specific code rather than a bare TypeError.
      throw new CommandServiceError(
        CommandErrorCodes.ForbiddenType,
        400,
        `No handler for command type ${envelope.command.type}`,
      );
    }

    let outcome: Awaited<ReturnType<typeof handler>>;
    try {
      outcome = await handler(
        {
          connection,
          actor: options.actor,
          projectId: options.projectId,
        },
        envelope.command as never,
      );
    } catch (error) {
      if (error instanceof CommandHandlerError) {
        // Handler errors map to well-known wire codes. `resource_wrong_project`
        // is deliberately reported as 404 so a tenant cannot probe another
        // tenant's IDs by URL substitution.
        const status = error.code === 'validation_failed' ? 422 : 404;
        throw new CommandServiceError(
          CommandErrorCodes.HandlerFailed,
          status,
          error.message,
          { handlerCode: error.code },
        );
      }
      throw error;
    }

    const commandId = randomUUID();
    const appliedRevision = currentRevision + 1;
    const expiresAt = new Date(now.getTime() + COMMAND_EXPIRY_DAYS * 86_400_000);

    await connection.execute(
      `INSERT INTO project_commands
         (id, project_id, actor_key, idempotency_key, command_type, command_json,
          command_sha256, inverse_json, result_json, expected_revision,
          applied_revision, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?, ?)`,
      [
        commandId,
        options.projectId,
        options.actor.actorKey,
        envelope.idempotencyKey,
        envelope.command.type,
        JSON.stringify(envelope.command),
        commandHash,
        outcome.inverse ? JSON.stringify(outcome.inverse) : null,
        JSON.stringify(outcome.result),
        envelope.expectedRevision ?? null,
        appliedRevision,
        toMysqlDate(now),
        toMysqlDate(expiresAt),
      ],
    );

    await connection.execute(
      'UPDATE projects SET revision = ? WHERE id = ? AND revision = ?',
      [appliedRevision, options.projectId, currentRevision],
    );

    return {
      commandId,
      revision: appliedRevision,
      result: outcome.result,
      replayed: false,
    };
  }, { pool: options.pool });
}

// Revision-pinned play snapshot -------------------------------------------

export interface WritePlaySnapshotOptions {
  projectId: string;
  expectedRevision: number;
  pool?: Pool;
}

export interface PlaySnapshotResult {
  snapshotId: string;
  revision: number;
  contentHash: string;
  reused: boolean;
}

export async function writePlaySnapshot(
  options: WritePlaySnapshotOptions,
): Promise<PlaySnapshotResult> {
  return withTransaction<PlaySnapshotResult>(async (connection) => {
    const currentRevision = await loadProjectRevision(connection, options.projectId);
    if (currentRevision === null) {
      throw new CommandServiceError(
        CommandErrorCodes.ValidationFailed,
        404,
        `Project ${options.projectId} not found`,
      );
    }
    if (currentRevision !== options.expectedRevision) {
      throw new CommandServiceError(
        CommandErrorCodes.RevisionConflict,
        409,
        `Expected revision ${options.expectedRevision} but project is at ${currentRevision}`,
        { currentRevision },
      );
    }

    // A snapshot for (project_id, revision) is stored exactly once. If it
    // already exists (e.g. two players ask to play the same revision at the
    // same instant), return the prior row instead of racing on the unique
    // key. This is what makes play-snapshot idempotent — a play link is a
    // permalink to a revision.
    const [existing] = await connection.execute(
      `SELECT id, snapshot_sha256 FROM project_play_snapshots
        WHERE project_id = ? AND revision = ?`,
      [options.projectId, currentRevision],
    );
    const priorList = existing as Array<{ id: string; snapshot_sha256: string }>;
    if (priorList[0]) {
      return {
        snapshotId: priorList[0].id,
        revision: currentRevision,
        contentHash: priorList[0].snapshot_sha256,
        reused: true,
      };
    }

    const snapshot = await loadProjectSnapshot(connection, options.projectId);
    if (!snapshot) {
      throw new CommandServiceError(
        CommandErrorCodes.ValidationFailed,
        404,
        `Project ${options.projectId} disappeared while snapshotting`,
      );
    }
    const contentHash = hashProjectSnapshot(snapshot);
    const snapshotId = randomUUID();
    await connection.execute(
      `INSERT INTO project_play_snapshots (id, project_id, revision, snapshot_json, snapshot_sha256)
         VALUES (?, ?, ?, ?, ?)`,
      [snapshotId, options.projectId, currentRevision, JSON.stringify(snapshot), contentHash],
    );

    return { snapshotId, revision: currentRevision, contentHash, reused: false };
  }, { pool: options.pool });
}
