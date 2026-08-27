import mysql from 'mysql2/promise';

// Ensure a single pool across HMR/dev reloads and serverless invocations
const globalForMysql = globalThis as unknown as {
  __mysqlPool?: mysql.Pool;
};

export function getPool(): mysql.Pool {
  if (!globalForMysql.__mysqlPool) {
    globalForMysql.__mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'gameengine',
      waitForConnections: true,
      connectionLimit: parseInt(process.env.MYSQL_POOL_LIMIT || '5'),
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }
  return globalForMysql.__mysqlPool!;
}

/**
 * Closes the shared pool, if one was ever opened.
 *
 * The server never calls this — the pool is meant to outlive every request.
 * It exists for tests: `enableKeepAlive` holds a socket open, so a suite that
 * imports any module reaching this pool keeps the Node event loop alive and
 * **never exits**, even after every assertion has passed. `test:consent-flow`
 * did exactly that — 10/10 green, then hung forever. Run under CI that is not
 * a flake, it is a job that burns its timeout on a suite that already
 * succeeded.
 *
 * Idempotent, and safe to call when no pool was created.
 */
export async function closePool(): Promise<void> {
  const pool = globalForMysql.__mysqlPool;
  if (!pool) return;
  globalForMysql.__mysqlPool = undefined;
  await pool.end();
}

export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const connection = await getPool().getConnection();
  try {
    const [rows] = await connection.execute(sql, params);
    return rows as T[];
  } finally {
    connection.release();
  }
}

export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const results = await query<T>(sql, params);
  return results[0] || null;
}

