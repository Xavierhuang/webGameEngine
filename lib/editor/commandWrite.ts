/**
 * Browser-side compat helper for project-graph writes.
 *
 * Task 4 introduced `If-Match: "<revision>"` + `Idempotency-Key` as
 * mandatory preconditions on every project-graph mutation. The legacy
 * editor client sent neither, so a raw `fetch(..., { method: 'PATCH' })`
 * from `GameEditor.tsx` now returns 428 on the server.
 *
 * This helper keeps the surgery small: a single `commandWrite(...)`
 * function threads the current project revision plus a per-call
 * idempotency key into every write. Callers pass a ref to the
 * revision counter so a successful write can bump it in place without a
 * round-trip re-render.
 *
 * On a 409 `revision_conflict` (another writer moved the revision past
 * ours between reads) `commandWrite` refetches `projects/[id]/revision`
 * and retries the write exactly once with the new revision — but with
 * the SAME idempotency key so a duplicate submission (retry that
 * actually did land) short-circuits to the stored result. Retrying with
 * a fresh idempotency key would let the retry double-execute.
 *
 * The idempotency-key format is deliberately non-cryptographic — the
 * server only needs it to detect a duplicate submission within a single
 * command's lifetime, not to authenticate the caller.
 */

export interface CommandWriteOptions {
  url: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  // Current project revision reference. `commandWrite` reads .current
  // before each call and updates it from the successful response body.
  revisionRef: { current: number };
  // Editor session identifier — one per open project — used to group
  // commands into an undo entry on the server. See `commandSchema.ts`.
  editingSessionId: string;
  // Owning project id. Required for the 409-refetch path (which hits
  // `/api/projects/[projectId]/revision`). Callers that want to opt out
  // of the retry can omit it.
  projectId?: string;
  // Additional wire headers (e.g. from an AI-assist call that wants a
  // specific undo group). Not used by the base editor writes.
  extraHeaders?: Record<string, string>;
}

function newIdempotencyKey(): string {
  // Requires 16+ chars per the envelope schema; a UUID with dashes
  // stripped is 32 chars.
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2).padEnd(16, '0');
  return `editor-${uuid}`;
}

async function performWrite(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response> {
  return fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function refetchRevision(projectId: string): Promise<number | null> {
  try {
    const response = await fetch(`/api/projects/${projectId}/revision`, { method: 'GET' });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.revision === 'number' ? data.revision : null;
  } catch {
    return null;
  }
}

// Detects the wire shape emitted by `commandRouteHelper.commandErrorResponse`
// for revision conflicts. `error === 'revision_conflict'` is the switch
// value; `currentRevision` (when present) is the fresh server-side value
// we can seed the ref with directly, avoiding one round-trip.
async function inspectConflict(response: Response): Promise<{ isConflict: boolean; freshRevision: number | null }> {
  if (response.status !== 409) return { isConflict: false, freshRevision: null };
  try {
    const cloned = response.clone();
    const data = await cloned.json();
    if (data?.error !== 'revision_conflict') return { isConflict: false, freshRevision: null };
    const fresh = typeof data.currentRevision === 'number' ? data.currentRevision : null;
    return { isConflict: true, freshRevision: fresh };
  } catch {
    return { isConflict: false, freshRevision: null };
  }
}

async function advanceRevisionFromResponse(
  response: Response,
  revisionRef: { current: number },
): Promise<void> {
  try {
    const cloned = response.clone();
    const data = await cloned.json();
    if (data && typeof data.revision === 'number' && data.revision > revisionRef.current) {
      revisionRef.current = data.revision;
    }
  } catch {
    // Body is not JSON (or already consumed) — leave the ref untouched.
    // The next write will 409 if a concurrent editor moved the revision
    // past us, and this helper's retry loop will refetch.
  }
}

export async function commandWrite(options: CommandWriteOptions): Promise<Response> {
  // Same idempotency key across the initial attempt and its 409 retry.
  // A different key on retry would let a request that actually landed
  // (but timed out mid-response) get executed a second time as if it
  // were a fresh command.
  const idempotencyKey = newIdempotencyKey();

  const buildHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
    'If-Match': `"${options.revisionRef.current}"`,
    'X-Editing-Session': options.editingSessionId,
    ...(options.extraHeaders ?? {}),
  });

  let response = await performWrite(options.url, options.method, options.body, buildHeaders());

  if (response.ok) {
    await advanceRevisionFromResponse(response, options.revisionRef);
    return response;
  }

  // 409 auto-retry. Skip the retry when the caller opted out (no
  // projectId supplied) — those callers usually run in contexts that
  // want to see the conflict explicitly.
  if (options.projectId) {
    const { isConflict, freshRevision } = await inspectConflict(response);
    if (isConflict) {
      // Prefer the server-supplied `currentRevision` (attached to every
      // revision_conflict response by the command service) so the retry
      // does not need a round-trip. Fall back to the revision endpoint
      // if the field was missing.
      const seed = freshRevision ?? (await refetchRevision(options.projectId));
      if (seed !== null && seed > options.revisionRef.current) {
        options.revisionRef.current = seed;
        const retry = await performWrite(
          options.url,
          options.method,
          options.body,
          buildHeaders(),
        );
        if (retry.ok) {
          await advanceRevisionFromResponse(retry, options.revisionRef);
        }
        return retry;
      }
    }
  }

  return response;
}

// Convenience for a plain UUID editingSessionId. Callers store the value
// in a ref so it stays stable for the lifetime of the editor window.
export function newEditingSessionId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
