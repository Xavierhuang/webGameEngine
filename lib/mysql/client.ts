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

