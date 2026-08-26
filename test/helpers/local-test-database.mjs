import mysql from 'mysql2/promise.js';
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

/** Open only the local integration-test database and never expose its handle. */
async function withApprovedConnection(
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
export async function publishProjectForLocalTest(baseUrl, projectId, options = {}) {
  return withApprovedConnection(baseUrl, async (connection) => {
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
  }, options);
}

/** Remove the known browser fixture even when HTTP setup failed partway through. */
export async function cleanupSecurityFixturesForLocalTest(
  baseUrl,
  { projectId = null, emails = [] } = {},
  options = {}
) {
  return withApprovedConnection(baseUrl, async (connection) => {
    await connection.beginTransaction();
    try {
      if (typeof projectId === 'string' && projectId) {
        const [result] = await connection.execute('DELETE FROM projects WHERE id = ?', [projectId]);
        if (result.affectedRows > 1) {
          throw new Error(`Cleanup deleted an unexpected ${result.affectedRows} projects`);
        }
      }

      const uniqueEmails = [...new Set(emails.filter((email) => typeof email === 'string' && email))];
      if (uniqueEmails.length > 0) {
        const placeholders = uniqueEmails.map(() => '?').join(', ');
        const [rows] = await connection.execute(
          `SELECT u.id AS user_id, p.id AS profile_id
             FROM users u
             LEFT JOIN profiles p ON p.user_id = u.id
            WHERE u.email IN (${placeholders})
            FOR UPDATE`,
          uniqueEmails
        );
        const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
        const profileIds = [...new Set(rows.map((row) => row.profile_id).filter(Boolean))];

        if (profileIds.length > 0) {
          const profilePlaceholders = profileIds.map(() => '?').join(', ');
          await connection.execute(
            `DELETE FROM projects WHERE owner_id IN (${profilePlaceholders})`,
            profileIds
          );
        }
        if (userIds.length > 0) {
          const userPlaceholders = userIds.map(() => '?').join(', ');
          await connection.execute(
            `DELETE FROM profiles WHERE user_id IN (${userPlaceholders})`,
            userIds
          );
          await connection.execute(`DELETE FROM users WHERE id IN (${userPlaceholders})`, userIds);
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }, options);
}
