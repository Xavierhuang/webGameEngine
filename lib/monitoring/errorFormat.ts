import { createHash } from 'crypto';

/**
 * Error grouping and redaction — pure, so node tests can require it directly.
 *
 * Kept apart from the DB-touching half for the same reason as
 * lib/auth/projectAccess.ts: the test scripts run bare `tsc`, which does not
 * resolve the `@/` alias.
 */

export const MAX_MESSAGE = 1000;
export const MAX_STACK = 4000;

/**
 * Group identical errors. The message plus the top stack frame is stable
 * across occurrences but distinct between real problems; including the whole
 * stack would fragment one bug into hundreds of rows.
 */
export function fingerprint(source: string, message: string, stack?: string | null): string {
  const topFrame = (stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('at ')) ?? '';
  return createHash('sha256').update(`${source}|${message}|${topFrame}`).digest('hex');
}

/**
 * Strip anything that looks like a secret before it reaches storage.
 *
 * Error messages routinely carry tokens — an auth failure will happily include
 * the header it rejected. Storing those would turn a diagnostics table into a
 * credential store.
 */
export function redact(text: string): string {
  return text
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[jwt]')
    .replace(/\b(?:re_|sk-|pk_)[A-Za-z0-9_-]{8,}/g, '[key]')
    .replace(/(password|token|secret|authorization)["\'\s:=]+[^\s,;}"\']+/gi, '$1=[redacted]');
}
