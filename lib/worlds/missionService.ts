import type { Pool } from 'mysql2/promise';
import type { Actor } from '../auth/actor';
import { requireProjectEdit } from '../auth/access';
import { withTransaction, type TransactionConnection } from '../mysql/transaction';
import { getWorldTemplate, type WorldMission, type WorldTemplateObjectType } from './templates';
import {
  collectStoredBlockTypes,
  evaluateWorldMission,
  parseWorldMissionAction,
  type WorldMissionAction,
} from './missions';

export interface MissionProgress {
  id: string;
  title: string;
  description: string;
  kind: WorldMission['kind'];
  status: 'not_started' | 'in_progress' | 'completed';
}

export class MissionServiceError extends Error {
  constructor(
    public readonly code: 'invalid_mission_action' | 'world_identity_mismatch',
    public readonly status: 422 | 404 = 422,
  ) {
    super(code);
  }
}

type RequireProjectEdit = typeof requireProjectEdit;

export interface MissionServiceOptions {
  pool?: Pick<Pool, 'getConnection'>;
  requireProjectEdit?: RequireProjectEdit;
}

interface WorldIdentityRow {
  template_id: string;
  template_version: number | string;
  world_metadata: unknown;
}

interface ProgressRow {
  mission_id: string;
  status: MissionProgress['status'];
}

interface ObjectRow {
  id: string;
  type: string;
  name: string;
}

interface BlockRow {
  block_type: string;
  block_data: unknown;
}

interface SnapshotRow {
  project_id: string;
  revision: number | string;
}

interface ProjectRevisionRow { revision: number | string; }
interface PlayerSessionRow { project_id: string; actor_profile_id: string; revision: number | string; }

interface WorldMissionBaseline {
  revision: number;
  initialObjectIds: ReadonlySet<string>;
  blockTypeCounts: ReadonlyMap<string, number>;
}

function parseMissionBaseline(value: unknown): WorldMissionBaseline | null {
  let metadata = value;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { return null; }
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  if (!Number.isInteger(record.baselineRevision) || (record.baselineRevision as number) < 0) return null;
  if (!Array.isArray(record.initialObjectIds) || !record.initialObjectIds.every((id) => typeof id === 'string' && id.length <= 128)) return null;
  if (!record.baselineBlockTypeCounts || typeof record.baselineBlockTypeCounts !== 'object' || Array.isArray(record.baselineBlockTypeCounts)) return null;
  const blockTypeCounts = new Map<string, number>();
  for (const [type, count] of Object.entries(record.baselineBlockTypeCounts as Record<string, unknown>)) {
    if (type.length > 128 || !Number.isInteger(count) || (count as number) < 0) return null;
    blockTypeCounts.set(type, count as number);
  }
  return {
    revision: record.baselineRevision as number,
    initialObjectIds: new Set(record.initialObjectIds as string[]),
    blockTypeCounts,
  };
}

async function loadTemplateForProject(connection: TransactionConnection, projectId: string) {
  const [rows] = await connection.execute(
    `SELECT template_id, template_version, world_metadata
       FROM project_worlds
      WHERE project_id = ?
      FOR UPDATE`,
    [projectId],
  );
  const identity = (rows as WorldIdentityRow[])[0];
  const template = identity && getWorldTemplate(identity.template_id, Number(identity.template_version));
  const baseline = identity && parseMissionBaseline(identity.world_metadata);
  if (!identity || !template || !baseline) throw new MissionServiceError('world_identity_mismatch');
  const [projectRows] = await connection.execute('SELECT revision FROM projects WHERE id = ? FOR UPDATE', [projectId]);
  const project = (projectRows as ProjectRevisionRow[])[0];
  if (!project) throw new MissionServiceError('world_identity_mismatch', 404);
  return { template, baseline, currentRevision: Number(project.revision) };
}

function progressDto(mission: WorldMission, status: MissionProgress['status']): MissionProgress {
  return {
    id: mission.id,
    title: mission.title,
    description: mission.description,
    kind: mission.kind,
    status,
  };
}

async function loadProgress(
  connection: TransactionConnection,
  projectId: string,
  missions: readonly WorldMission[],
): Promise<MissionProgress[]> {
  const [rows] = await connection.execute(
    'SELECT mission_id, status FROM world_mission_progress WHERE project_id = ?',
    [projectId],
  );
  const statuses = new Map((rows as ProgressRow[]).map((row) => [row.mission_id, row.status]));
  return missions.map((mission) => progressDto(mission, statuses.get(mission.id) ?? 'not_started'));
}

function targetTemplateObject(mission: WorldMission, template: ReturnType<typeof getWorldTemplate>) {
  if (!template || !mission.objectId) return null;
  return template.scenes.flatMap((scene) => scene.objects).find((object) => object.id === mission.objectId) ?? null;
}

async function verifyObjectAction(
  connection: TransactionConnection,
  projectId: string,
  mission: WorldMission,
  template: NonNullable<ReturnType<typeof getWorldTemplate>>,
  baseline: WorldMissionBaseline,
  currentRevision: number,
  action: Extract<WorldMissionAction, { type: 'object_present' }>,
): Promise<boolean> {
  const expectedType = mission.objectType ?? targetTemplateObject(mission, template)?.type;
  if (!expectedType) return false;
  const [rows] = await connection.execute(
    `SELECT object_row.id, object_row.type, object_row.name
       FROM game_objects object_row
       JOIN scenes scene ON scene.id = object_row.scene_id
      WHERE object_row.id = ? AND scene.project_id = ?`,
    [action.objectId, projectId],
  );
  const object = (rows as ObjectRow[])[0];
  if (
    !object
    || object.type !== expectedType
    || baseline.initialObjectIds.has(object.id)
    || currentRevision <= baseline.revision
  ) return false;
  return evaluateWorldMission(mission, {
    type: 'object_present',
    // Legacy templates use their catalog object ID as the evaluator's stable
    // semantic token. Type-based v2 missions instead verify the submitted new
    // object UUID through verifiedObjectType.
    objectId: mission.objectType ? action.objectId : mission.objectId ?? '',
    verifiedObjectType: expectedType as WorldTemplateObjectType,
  });
}

async function verifyBlockAction(
  connection: TransactionConnection,
  projectId: string,
  mission: WorldMission,
  baseline: WorldMissionBaseline,
  currentRevision: number,
  action: Extract<WorldMissionAction, { type: 'block_present' }>,
): Promise<boolean> {
  const [objectRows] = await connection.execute(
    `SELECT object_row.id, object_row.type, object_row.name
       FROM game_objects object_row
       JOIN scenes scene ON scene.id = object_row.scene_id
      WHERE object_row.id = ? AND scene.project_id = ?`,
    [action.objectId, projectId],
  );
  if (!(objectRows as ObjectRow[])[0]) return false;
  const [blockRows] = await connection.execute(
    'SELECT block_type, block_data FROM logic_blocks WHERE project_id = ? ORDER BY order_index',
    [projectId],
  );
  const verifiedBlockTypes = new Set<string>();
  let targetCount = 0;
  const countStoredTypes = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const block = value as Record<string, unknown>;
    if (block.block_type === mission.blockType) targetCount += 1;
    for (const branch of [block.children, block.elseChildren]) {
      if (Array.isArray(branch)) for (const child of branch) countStoredTypes(child);
    }
  };
  for (const row of blockRows as BlockRow[]) {
    verifiedBlockTypes.add(row.block_type);
    if (row.block_type === mission.blockType) targetCount += 1;
    let blockData = row.block_data;
    if (typeof blockData === 'string') {
      try { blockData = JSON.parse(blockData); } catch { blockData = null; }
    }
    collectStoredBlockTypes(blockData, verifiedBlockTypes);
    countStoredTypes(blockData);
  }
  if (currentRevision <= baseline.revision) return false;
  if (targetCount <= (baseline.blockTypeCounts.get(mission.blockType ?? '') ?? 0)) return false;
  return evaluateWorldMission(mission, {
    type: 'block_present',
    objectId: action.objectId,
    verifiedBlockTypes: [...verifiedBlockTypes],
  });
}

async function verifyPlayerSessionAction(
  connection: TransactionConnection,
  actor: Exclude<Actor, { kind: 'anonymous' }>,
  projectId: string,
  action: Extract<WorldMissionAction, { type: 'play_started' | 'outcome_reached' }>,
  createSession: boolean,
): Promise<{ valid: boolean; revision: number }> {
  const [rows] = await connection.execute(
    `SELECT snapshot.project_id, snapshot.revision
       FROM project_play_snapshots snapshot
       JOIN projects project ON project.id = snapshot.project_id
      WHERE snapshot.id = ? AND snapshot.project_id = ? AND snapshot.revision = project.revision`,
    [action.snapshotId, projectId],
  );
  const snapshot = (rows as SnapshotRow[])[0];
  if (!snapshot) return { valid: false, revision: 0 };
  if (createSession) {
    await connection.execute(
      `INSERT INTO world_mission_sessions (snapshot_id, project_id, actor_profile_id, revision)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE snapshot_id = snapshot_id`,
      [action.snapshotId, projectId, actor.profileId, Number(snapshot.revision)],
    );
  }
  const [sessionRows] = await connection.execute(
    'SELECT project_id, actor_profile_id, revision FROM world_mission_sessions WHERE snapshot_id = ?',
    [action.snapshotId],
  );
  const session = (sessionRows as PlayerSessionRow[])[0];
  return {
    valid: Boolean(session)
      && session.project_id === projectId
      && session.actor_profile_id === actor.profileId
      && Number(session.revision) === Number(snapshot.revision),
    revision: Number(snapshot.revision),
  };
}

function boundedEvidence(action: WorldMissionAction, revision?: number): Record<string, string | number> {
  const evidence: Record<string, string | number> = { action: action.type };
  if (action.type === 'object_present' || action.type === 'block_present') evidence.objectId = action.objectId;
  if (action.type === 'play_started' || action.type === 'outcome_reached') evidence.snapshotId = action.snapshotId;
  if (action.type === 'outcome_reached') evidence.outcome = action.outcome;
  if (revision !== undefined) evidence.revision = revision;
  return evidence;
}

export function createMissionService(options: MissionServiceOptions = {}) {
  const authorizeEdit = options.requireProjectEdit ?? requireProjectEdit;

  async function getMissionProgress({ actor, projectId }: { actor: Actor; projectId: string }): Promise<MissionProgress[]> {
    await authorizeEdit(actor, projectId);
    return withTransaction(async (connection) => {
      const { template } = await loadTemplateForProject(connection, projectId);
      return loadProgress(connection, projectId, template.missions);
    }, options.pool ? { pool: options.pool } : undefined);
  }

  async function recordWorldMissionAction({
    actor,
    projectId,
    action: rawAction,
  }: {
    actor: Actor;
    projectId: string;
    action: unknown;
  }): Promise<MissionProgress[]> {
    await authorizeEdit(actor, projectId);
    if (actor.kind === 'anonymous') throw new MissionServiceError('invalid_mission_action');
    const parsed = parseWorldMissionAction(rawAction);
    if (!parsed.success) throw new MissionServiceError('invalid_mission_action');
    const action = parsed.data;

    return withTransaction(async (connection) => {
      const { template, baseline, currentRevision } = await loadTemplateForProject(connection, projectId);
      let completedMission: WorldMission | null = null;
      let revision: number | undefined;
      for (const mission of template.missions) {
        let matched = false;
        if (action.type === 'object_present' && mission.kind === 'object_present') {
          matched = await verifyObjectAction(connection, projectId, mission, template, baseline, currentRevision, action);
        } else if (action.type === 'block_present' && mission.kind === 'block_present') {
          matched = await verifyBlockAction(connection, projectId, mission, baseline, currentRevision, action);
        } else if (action.type === 'play_started' && mission.kind === 'play_started') {
          const session = await verifyPlayerSessionAction(connection, actor, projectId, action, false);
          revision = session.revision;
          matched = session.valid && evaluateWorldMission(mission, {
            type: 'play_started', projectId, sessionProjectId: projectId,
          });
        }
        if (matched) {
          completedMission = mission;
          break;
        }
      }

      if (completedMission) {
        await connection.execute(
          `INSERT INTO world_mission_progress (project_id, mission_id, status, action_evidence)
           VALUES (?, ?, 'completed', ?)
           ON DUPLICATE KEY UPDATE
             status = IF(status = 'completed', 'completed', VALUES(status)),
             action_evidence = IF(status = 'completed', action_evidence, VALUES(action_evidence))`,
          [projectId, completedMission.id, JSON.stringify(boundedEvidence(action, revision))],
        );
      }
      return loadProgress(connection, projectId, template.missions);
    }, options.pool ? { pool: options.pool } : undefined);
  }

  async function startWorldMissionSession({
    actor,
    projectId,
    snapshotId,
  }: {
    actor: Actor;
    projectId: string;
    snapshotId: unknown;
  }): Promise<{ snapshotId: string; revision: number }> {
    await authorizeEdit(actor, projectId);
    if (actor.kind === 'anonymous') throw new MissionServiceError('invalid_mission_action');
    const parsed = parseWorldMissionAction({ type: 'play_started', snapshotId });
    if (!parsed.success || parsed.data.type !== 'play_started') throw new MissionServiceError('invalid_mission_action');
    const action = parsed.data;
    return withTransaction(async (connection) => {
      // A world identity/baseline is required even for session start so old
      // metadata cannot create a side channel around mission progress.
      await loadTemplateForProject(connection, projectId);
      const session = await verifyPlayerSessionAction(connection, actor, projectId, action, true);
      if (!session.valid) throw new MissionServiceError('invalid_mission_action');
      return { snapshotId: action.snapshotId, revision: session.revision };
    }, options.pool ? { pool: options.pool } : undefined);
  }

  return { getMissionProgress, recordWorldMissionAction, startWorldMissionSession };
}

const defaultMissionService = createMissionService();
export const getMissionProgress = defaultMissionService.getMissionProgress;
export const recordWorldMissionAction = defaultMissionService.recordWorldMissionAction;
export const startWorldMissionSession = defaultMissionService.startWorldMissionSession;
