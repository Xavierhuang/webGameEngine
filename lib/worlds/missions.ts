import type { WorldMission } from './templates';

export type WorldMissionAction =
  | { type: 'object_present'; objectId: string }
  | { type: 'block_present'; objectId: string }
  | { type: 'play_started'; snapshotId: string }
  | { type: 'outcome_reached'; snapshotId: string; outcome: 'win' | 'fun' };

export type VerifiedWorldMissionAction =
  | WorldMissionAction
  | {
      type: 'block_present';
      objectId: string;
      /** Server-derived types from the stored block row and nested branches. */
      verifiedBlockTypes: readonly string[];
    }
  | {
      type: 'play_started';
      projectId: string;
      sessionProjectId: string;
      snapshotId?: string;
      templateId?: string;
    }
  | {
      type: 'outcome_reached';
      outcome: 'win' | 'fun';
      projectId?: string;
      sessionProjectId?: string;
      snapshotId?: string;
      templateId?: string;
    };

export type MissionActionParseResult =
  | { success: true; data: WorldMissionAction }
  | { success: false; error: 'invalid_mission_action' };

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isBoundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

/** Parse the small client candidate payload. Never accept block content or UI state as evidence. */
export function parseWorldMissionAction(value: unknown): MissionActionParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { success: false, error: 'invalid_mission_action' };
  }
  const action = value as Record<string, unknown>;
  if (action.type === 'object_present' && hasOnlyKeys(action, ['type', 'objectId']) && isBoundedId(action.objectId)) {
    return { success: true, data: { type: 'object_present', objectId: action.objectId } };
  }
  if (action.type === 'block_present' && hasOnlyKeys(action, ['type', 'objectId']) && isBoundedId(action.objectId)) {
    return { success: true, data: { type: 'block_present', objectId: action.objectId } };
  }
  if (action.type === 'play_started' && hasOnlyKeys(action, ['type', 'snapshotId']) && isBoundedId(action.snapshotId)) {
    return { success: true, data: { type: 'play_started', snapshotId: action.snapshotId } };
  }
  if (
    action.type === 'outcome_reached'
    && hasOnlyKeys(action, ['type', 'snapshotId', 'outcome'])
    && isBoundedId(action.snapshotId)
    && (action.outcome === 'win' || action.outcome === 'fun')
  ) {
    return { success: true, data: { type: 'outcome_reached', snapshotId: action.snapshotId, outcome: action.outcome } };
  }
  return { success: false, error: 'invalid_mission_action' };
}

/** Pure, deterministic mission predicate over candidate data already verified by the server. */
export function evaluateWorldMission(
  mission: WorldMission & { templateId?: string },
  action: VerifiedWorldMissionAction | { type: string; [key: string]: unknown },
): boolean {
  const candidate = action as Record<string, unknown>;
  if (
    mission.templateId
    && typeof candidate.templateId === 'string'
    && mission.templateId !== candidate.templateId
  ) return false;
  if (mission.kind !== action.type) return false;

  switch (mission.kind) {
    case 'object_present':
      return action.type === 'object_present' && action.objectId === mission.objectId;
    case 'block_present':
      return action.type === 'block_present'
        && Array.isArray(candidate.verifiedBlockTypes)
        && candidate.verifiedBlockTypes.includes(mission.blockType ?? '');
    case 'play_started':
      return action.type === 'play_started'
        && candidate.projectId === candidate.sessionProjectId;
    case 'outcome_reached':
      // The runtime does not yet write server-authenticated gameplay facts.
      // A client-provided outcome label must never become mission evidence.
      return false;
  }
}

/** Extract only block type labels from a stored Blockly branch; block contents remain server-private. */
export function collectStoredBlockTypes(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return into;
  const block = value as Record<string, unknown>;
  if (typeof block.block_type === 'string' && block.block_type.length <= 128) into.add(block.block_type);
  for (const branch of [block.children, block.elseChildren]) {
    if (!Array.isArray(branch)) continue;
    for (const child of branch) collectStoredBlockTypes(child, into);
  }
  return into;
}
