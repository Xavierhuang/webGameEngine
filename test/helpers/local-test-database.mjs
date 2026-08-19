import mysql from 'mysql2/promise';
import { assertLocalBaseUrl } from './local-base-url.mjs';

const LOOPBACK_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const TEST_DATABASE = 'gameengine_test';

function approvedConfig(baseUrl, env) {
  assertLocalBaseUrl(baseUrl);

  const host = env.MYSQL_HOST || 'localhost';
  const database = env.MYSQL_DATABASE || 'gameengine';
  if (!LOOPBACK_DATABASE_HOSTS.has(host)) {
    throw new Error(`Refusing non-loopback MySQL host: ${host}`);
  }
  if (database !== TEST_DATABASE) {
    throw new Error(`Refusing database ${database}; expected exactly ${TEST_DATABASE}`);
  }

  return {
    host,
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    database,
  };
}

/** Open only the local integration-test database and always close it. */
export async function withLocalTestDatabase(
  baseUrl,
  callback,
  { env = process.env, connect = (config) => mysql.createConnection(config) } = {}
) {
  const config = approvedConfig(baseUrl, env);
  const connection = await connect(config);
  try {
    return await callback(connection);
  } finally {
    await connection.end();
  }
}

/** Test-only publication bridge until Task 8 provides the production workflow. */
export async function publishProjectForTest(connection, projectId) {
  const [result] = await connection.execute(
    `UPDATE projects
        SET visibility = 'public', is_published = TRUE, moderation_status = 'published'
      WHERE id = ?`,
    [projectId]
  );
  if (result.affectedRows !== 1) {
    throw new Error(`Expected exactly one project to publish, updated ${result.affectedRows}`);
  }

  const [rows] = await connection.execute(
    'SELECT visibility, moderation_status FROM projects WHERE id = ?',
    [projectId]
  );
  if (
    rows.length !== 1 ||
    rows[0].visibility !== 'public' ||
    rows[0].moderation_status !== 'published'
  ) {
    throw new Error('Project did not reach the exact public/published test state');
  }
}

export async function deleteProjectForTest(connection, projectId) {
  const [result] = await connection.execute('DELETE FROM projects WHERE id = ?', [projectId]);
  if (result.affectedRows > 1) {
    throw new Error(`Cleanup deleted an unexpected ${result.affectedRows} projects`);
  }
}
