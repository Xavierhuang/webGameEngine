import { NextResponse } from 'next/server';
import type { ReleaseServiceErrorCode } from '@/lib/worlds/releaseTypes';

/**
 * Shared HTTP mapping for the four world-release route handlers.
 *
 * The check is structural rather than `instanceof`. Route handlers, server
 * components, and the service can each resolve `releaseService` through a
 * different specifier, and two module instances would make `instanceof` fail
 * open into a 500 for what is really a typed 403/404/409. Matching on the
 * name plus a bounded numeric status keeps one taxonomy without that hazard.
 */
export interface TypedReleaseError {
  name: 'ReleaseServiceError';
  code: ReleaseServiceErrorCode;
  status: number;
}

const RELEASE_ERROR_STATUSES: ReadonlySet<number> = new Set([400, 403, 404, 409, 422, 503]);

export function isReleaseServiceError(error: unknown): error is TypedReleaseError {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown; status?: unknown };
  return candidate.name === 'ReleaseServiceError'
    && typeof candidate.code === 'string'
    && typeof candidate.status === 'number'
    && RELEASE_ERROR_STATUSES.has(candidate.status);
}

/**
 * Maps a typed release error to its response, or null when the caller should
 * fall through to a generic 500. Only the fixed error code crosses the
 * boundary — never a message, stack, driver code, or SQL fragment.
 */
export function releaseErrorResponse(error: unknown): NextResponse | null {
  if (!isReleaseServiceError(error)) return null;
  if (error.code === 'feature_unavailable') {
    return NextResponse.json({ error: 'feature_unavailable', reason: 'flag_disabled' }, { status: 503 });
  }
  return NextResponse.json({ error: error.code }, { status: error.status });
}

/** The single generic failure shape. Callers log the cause; responses never carry it. */
export function releaseFailureResponse(scope: string, error: unknown): NextResponse {
  console.error(`[world-release] ${scope} failed:`, error);
  return NextResponse.json({ error: 'release_request_failed' }, { status: 500 });
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export function invalidInputResponse(): NextResponse {
  return NextResponse.json({ error: 'invalid_release_input' }, { status: 422 });
}

/**
 * Parses a JSON body that must be an object carrying only `allowedKeys`. Any
 * unexpected key is rejected outright rather than ignored, so a caller cannot
 * smuggle server-owned identity (release, project, snapshot, hash) into a
 * request and have it silently dropped.
 */
export async function parseStrictBody(
  request: { json: () => Promise<unknown> },
  allowedKeys: readonly string[],
): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // A route that accepts no keys at all takes both `{}` and no body, because
    // `fetch(url, { method: 'POST' })` with no body is the natural way to call
    // one and there is nothing about it left to get wrong. Routes that do take
    // keys still reject an unparseable body.
    return allowedKeys.length === 0 ? {} : null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entries = Object.keys(body as Record<string, unknown>);
  if (entries.some((key) => !allowedKeys.includes(key))) return null;
  return body as Record<string, unknown>;
}

/** An `Idempotency-Key` header must be present and between 16 and 128 characters. */
export function readIdempotencyKey(request: { headers: { get: (name: string) => string | null } }): string | null {
  const key = request.headers.get('Idempotency-Key');
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  return trimmed.length >= 16 && trimmed.length <= 128 ? trimmed : null;
}
