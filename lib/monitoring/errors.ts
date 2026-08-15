import { randomUUID } from 'crypto';
import { query } from '@/lib/mysql/server';
import { fingerprint, redact, MAX_MESSAGE, MAX_STACK } from './errorFormat';

export { fingerprint, redact };

/**
 * Error capture.
 *
 * Self-hosted rather than a vendor: no account, no DSN, and no third party
 * receiving data from a children's product. Deliberately small — recent
 * errors, grouped, not a full APM.
 *
 * Recording an error must never throw. A failure here would turn a handled
 * problem into an unhandled one, which is the opposite of the point.
 */

export interface CapturedError {
  source: 'server' | 'client';
  message: string;
  stack?: string | null;
  url?: string | null;
  profileId?: string | null;
  userAgent?: string | null;
}

export async function captureError(event: CapturedError): Promise<void> {
  try {
    const message = redact(String(event.message ?? '')).slice(0, MAX_MESSAGE);
    if (!message) return;
    const stack = event.stack ? redact(String(event.stack)).slice(0, MAX_STACK) : null;
    const fp = fingerprint(event.source, message, stack);

    // Collapse repeats onto one row: a single broken page viewed a thousand
    // times shouldn't bury every other error.
    await query(
      `INSERT INTO error_events
         (id, source, message, stack, url, profile_id, user_agent, fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         occurrences = occurrences + 1,
         last_seen = CURRENT_TIMESTAMP,
         resolved = FALSE`,
      [
        randomUUID(),
        event.source,
        message,
        stack,
        event.url ? String(event.url).slice(0, 500) : null,
        event.profileId ?? null,
        event.userAgent ? String(event.userAgent).slice(0, 300) : null,
        fp,
      ]
    );
  } catch (error) {
    // Never rethrow: this is the error path.
    console.error('[monitoring] failed to record error:', error);
  }
}
