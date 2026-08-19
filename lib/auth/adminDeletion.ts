import { getPool } from '../mysql/client';
import { canDeleteAccount, type AdminActor } from './adminAccess';

interface AdminDeletionConnection {
  beginTransaction(): Promise<void>;
  execute(sql: string, values?: unknown[]): Promise<[unknown, ...unknown[]]>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface AdminDeletionDependencies {
  getConnection(): Promise<AdminDeletionConnection>;
}

interface LockedTarget extends AdminActor {
  user_id: string;
}

export class AdminDeletionError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 500
  ) {
    super(message);
    this.name = 'AdminDeletionError';
  }
}

const defaultDependencies: AdminDeletionDependencies = {
  getConnection: async () =>
    getPool().getConnection() as unknown as Promise<AdminDeletionConnection>,
};

function affectedRows(result: unknown): number {
  return Number((result as { affectedRows?: number })?.affectedRows ?? -1);
}

/**
 * Atomically delete an account from a role/email snapshot locked inside the
 * same transaction as every destructive statement.
 */
export async function deleteAdminAccount(
  admin: AdminActor,
  input: { profileId: string; confirmEmail: string; ownerEmails: string[] },
  dependencies: AdminDeletionDependencies = defaultDependencies
): Promise<{ email: string }> {
  const connection = await dependencies.getConnection();
  try {
    await connection.beginTransaction();

    const [targetResult] = await connection.execute(
      `SELECT p.id, p.role, p.user_id, u.email
         FROM profiles p
         JOIN users u ON u.id = p.user_id
        WHERE p.id = ?
        FOR UPDATE`,
      [input.profileId]
    );
    const target = (targetResult as LockedTarget[])[0];
    if (!target) throw new AdminDeletionError('Account not found', 404);

    const decision = canDeleteAccount(admin, target, input.ownerEmails);
    if (!decision.ok) throw new AdminDeletionError(decision.reason, 403);

    if ((input.confirmEmail ?? '').trim().toLowerCase() !== target.email.toLowerCase()) {
      throw new AdminDeletionError('Type the account’s email address to confirm deletion.', 400);
    }

    const [countResult] = await connection.execute(
      'SELECT COUNT(*) AS project_count FROM projects WHERE owner_id = ? FOR UPDATE',
      [target.id]
    );
    const expectedProjects = Number(
      (countResult as Array<{ project_count: number | string }>)[0]?.project_count ?? 0
    );

    const [projectsResult] = await connection.execute(
      'DELETE FROM projects WHERE owner_id = ?',
      [target.id]
    );
    if (affectedRows(projectsResult) !== expectedProjects) {
      throw new AdminDeletionError('Project delete affected an unexpected number of rows.', 500);
    }

    const [profileResult] = await connection.execute('DELETE FROM profiles WHERE id = ?', [target.id]);
    if (affectedRows(profileResult) !== 1) {
      throw new AdminDeletionError('Profile delete affected an unexpected number of rows.', 500);
    }

    const [userResult] = await connection.execute('DELETE FROM users WHERE id = ?', [target.user_id]);
    if (affectedRows(userResult) !== 1) {
      throw new AdminDeletionError('User delete affected an unexpected number of rows.', 500);
    }

    await connection.commit();
    return { email: target.email };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
