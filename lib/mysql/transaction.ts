import type { Pool, PoolConnection } from 'mysql2/promise';
import { getPool } from './client';

// A pool connection with an active transaction. Type alias so callers don't
// pull mysql2's Pool types directly — leaves room to swap the driver later
// without touching every write path.
export type TransactionConnection = PoolConnection;

// MySQL surfaces contention as two distinct codes; each is idempotent-safe to
// retry because the transaction rolled back before we saw the error. Any other
// error (constraint violation, syntax, connection loss) is not retried —
// blindly retrying non-idempotent failures can double-write or hide bugs.
const RETRIABLE_CODES: ReadonlySet<string> = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

// Initial attempt + up to two retries, per the plan's explicit budget.
const MAX_ATTEMPTS = 3;

// Per-retry backoff windows, in milliseconds. Randomization inside each window
// spreads out concurrent retriers so they do not re-collide on the same row.
const RETRY_DELAY_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [25, 75],
  [75, 175],
];

export interface WithTransactionOptions {
  pool?: Pick<Pool, 'getConnection'>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

// Runs `operation` inside a BEGIN/COMMIT block on the given connection. On
// failure, rolls back and rethrows the original error. If rollback itself
// fails, throws a wrapper that carries the original operation error as `cause`
// so callers never lose the real root cause to a cleanup follow-on error.
// Always releases the connection in `finally` — leaking a pool slot is worse
// than most errors that could get us here.
export async function runTransaction<T>(
  connection: TransactionConnection,
  operation: (connection: TransactionConnection) => Promise<T>,
): Promise<T> {
  try {
    await connection.beginTransaction();
    let result: T;
    try {
      result = await operation(connection);
    } catch (operationError) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        const rollbackMessage =
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        throw Object.assign(
          new Error(`Rollback failed after operation error: ${rollbackMessage}`),
          { cause: operationError },
        );
      }
      throw operationError;
    }
    await connection.commit();
    return result;
  } finally {
    connection.release();
  }
}

// Acquires a fresh connection from the pool per attempt and delegates to
// `runTransaction`. Retriable contention triggers a bounded backoff loop
// (initial + 2 retries) with per-window jitter. `sleep` and `random` are
// injectable so retry orchestration is deterministic under test — the retry
// count check would otherwise be flaky.
export async function withTransaction<T>(
  operation: (connection: TransactionConnection) => Promise<T>,
  options?: WithTransactionOptions,
): Promise<T> {
  const pool = options?.pool ?? getPool();
  const sleep = options?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options?.random ?? Math.random;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const connection = await pool.getConnection();
    try {
      return await runTransaction(connection, operation);
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string } | null)?.code;
      const retriable = code !== undefined && RETRIABLE_CODES.has(code);
      const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
      if (!retriable || isLastAttempt) {
        throw error;
      }
      const [lo, hi] = RETRY_DELAY_WINDOWS[attempt];
      const delayMs = lo + Math.floor(random() * (hi - lo));
      await sleep(delayMs);
    }
  }
  throw lastError;
}
