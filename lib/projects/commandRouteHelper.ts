/**
 * Route → command-service adapter.
 *
 * Task 4's compatibility-writer contract is:
 *
 *   - `Idempotency-Key` header is required on every write. Missing → 428.
 *   - `If-Match: "<revision>"` header is required on every non-creation
 *     write. Missing → 428. A stale value → 409 `revision_conflict` from
 *     the service.
 *
 * This module extracts the two headers, packages them into a
 * `ProjectCommandEnvelope`, and returns a wire-shape `NextResponse` on
 * missing preconditions or on any `CommandServiceError` the caller
 * bubbles up. Every migrated route funnels through the same helper so
 * the disabled-precondition contract is defined once.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import type { NextRequest } from 'next/server';
import { CommandErrorCodes, type ProjectCommand } from './commandSchema';
import { CommandServiceError, executeProjectCommand } from './commandService';
import type { CommandActor } from './commandHandlers';

export class PreconditionRequired extends Error {
  constructor(public readonly header: 'Idempotency-Key' | 'If-Match') {
    super(`${header} header is required`);
    this.name = 'PreconditionRequired';
  }
}

// Parse the RFC-7232 If-Match syntax the client sends: `"<revision>"`.
// The revision is a non-negative integer; anything else is a bad request.
export function parseIfMatchRevision(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const stripped = trimmed.replace(/^W\//, '').replace(/^"(.*)"$/, '$1');
  if (!/^\d+$/.test(stripped)) return null;
  const parsed = Number(stripped);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export interface CompatEnvelopeInputs {
  request: Pick<NextRequest, 'headers'>;
  command: ProjectCommand;
  // Optional — allows creation-time writers (which have no prior
  // revision) to skip the If-Match check.
  requireIfMatch?: boolean;
}

export interface CompatEnvelope {
  expectedRevision: number | undefined;
  idempotencyKey: string;
  editingSessionId: string;
  groupId: string;
  command: ProjectCommand;
}

export function buildCompatEnvelope(inputs: CompatEnvelopeInputs): CompatEnvelope {
  const idempotencyKey = inputs.request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length < 16) {
    throw new PreconditionRequired('Idempotency-Key');
  }

  const requireIfMatch = inputs.requireIfMatch !== false;
  const ifMatch = inputs.request.headers.get('if-match');
  const expectedRevision = parseIfMatchRevision(ifMatch);
  if (requireIfMatch && expectedRevision === null) {
    throw new PreconditionRequired('If-Match');
  }

  const editingSessionHeader = inputs.request.headers.get('x-editing-session') || randomUUID();
  const groupHeader = inputs.request.headers.get('x-command-group') || 'compat';

  return {
    expectedRevision: expectedRevision ?? undefined,
    idempotencyKey,
    editingSessionId: editingSessionHeader,
    groupId: groupHeader,
    command: inputs.command,
  };
}

// Serialize any service error to the wire shape the routes expect. Kept
// separate from `withCommand` below so admin/AI callers that dispatch
// commands from other contexts can reuse the same envelope.
export function commandErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof PreconditionRequired) {
    return NextResponse.json(
      { error: 'precondition_required', missing: error.header },
      { status: 428 },
    );
  }
  if (error instanceof CommandServiceError) {
    const body: Record<string, unknown> = {
      error: error.code,
      message: error.message,
    };
    if (
      error.code === CommandErrorCodes.RevisionConflict &&
      error.attributes?.currentRevision !== undefined
    ) {
      body.currentRevision = error.attributes.currentRevision;
    }
    return NextResponse.json(body, { status: error.httpStatus });
  }
  return null;
}

// Convenience wrapper: routes call this with the actor, project id, and
// a command builder; the helper handles preconditions, dispatch, and
// error serialization.
export async function dispatchCompatCommand(options: {
  request: Pick<NextRequest, 'headers'>;
  actor: CommandActor;
  projectId: string;
  command: ProjectCommand;
  requireIfMatch?: boolean;
}): Promise<NextResponse> {
  try {
    const envelope = buildCompatEnvelope({
      request: options.request,
      command: options.command,
      requireIfMatch: options.requireIfMatch,
    });
    const result = await executeProjectCommand({
      actor: options.actor,
      projectId: options.projectId,
      envelope,
    });
    return NextResponse.json({
      commandId: result.commandId,
      revision: result.revision,
      result: result.result,
      replayed: result.replayed,
    });
  } catch (error) {
    const serialized = commandErrorResponse(error);
    if (serialized) return serialized;
    throw error;
  }
}

// Actor helper — resolveActor returns the raw session shape, but the
// service wants `{kind, profileId, actorKey}`. This translation lives
// here so every migrated route encodes the same actorKey format for
// audit purposes.
export function toCommandActor(
  actor: { kind: 'user' | 'guest' | 'anonymous'; profileId?: string; userId?: string },
): CommandActor {
  if (actor.kind === 'anonymous' || !actor.profileId) {
    throw new Error('anonymous actor cannot execute project commands');
  }
  return {
    kind: actor.kind,
    profileId: actor.profileId,
    actorKey: actor.kind === 'user' ? `user:${actor.userId}` : `guest:${actor.profileId}`,
  };
}
