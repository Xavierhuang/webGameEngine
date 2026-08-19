import { getPool } from '../mysql/client';

export class ReorderError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404
  ) {
    super(message);
    this.name = 'ReorderError';
  }
}

interface ReorderConnection {
  beginTransaction(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<[unknown, unknown?]>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface ReorderDependencies {
  getConnection(): Promise<ReorderConnection>;
}

const defaultDependencies: ReorderDependencies = {
  getConnection: () => getPool().getConnection() as unknown as Promise<ReorderConnection>,
};

/** Validate and apply one scene's order under a single row-locking transaction. */
export async function reorderSceneObjects(
  sceneId: string,
  orderedIds: unknown[],
  dependencies: ReorderDependencies = defaultDependencies
): Promise<void> {
  if (
    orderedIds.length === 0 ||
    orderedIds.some((id) => typeof id !== 'string' || id.length === 0) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    throw new ReorderError('orderedIds must contain unique object IDs', 400);
  }

  const ids = orderedIds as string[];
  const connection = await dependencies.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = ids.map(() => '?').join(', ');
    const [rawRows] = await connection.execute(
      `SELECT id FROM game_objects
        WHERE scene_id = ? AND id IN (${placeholders})
        FOR UPDATE`,
      [sceneId, ...ids]
    );
    const rows = rawRows as Array<{ id: string }>;
    const matched = new Set(rows.map((row) => row.id));
    if (matched.size !== ids.length || ids.some((id) => !matched.has(id))) {
      throw new ReorderError('One or more objects were not found in this scene', 404);
    }

    const cases = ids.map(() => 'WHEN ? THEN ?').join(' ');
    const caseValues = ids.flatMap((id, index) => [id, index]);
    await connection.execute(
      `UPDATE game_objects
          SET order_index = CASE id ${cases} ELSE order_index END
        WHERE scene_id = ? AND id IN (${placeholders})`,
      [...caseValues, sceneId, ...ids]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
