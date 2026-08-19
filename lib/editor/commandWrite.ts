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
 * The idempotency-key format is deliberately non-cryptographic — the
 * server only needs it to detect a duplicate submission within a single
 * command's lifetime (a retry), not to authenticate the caller.
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

export async function commandWrite(options: CommandWriteOptions): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Idempotency-Key': newIdempotencyKey(),
    'If-Match': `"${options.revisionRef.current}"`,
    'X-Editing-Session': options.editingSessionId,
    ...(options.extraHeaders ?? {}),
  };

  const response = await fetch(options.url, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.ok) {
    // Peek at the response body to advance the revision. Clone first so
    // the caller can still `.json()` themselves.
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      if (data && typeof data.revision === 'number' && data.revision > options.revisionRef.current) {
        options.revisionRef.current = data.revision;
      }
    } catch {
      // Response body is not JSON (or already consumed) — leave the ref
      // untouched; the next write will 409 if a concurrent editor moved
      // the revision past us, and the caller can refetch.
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
