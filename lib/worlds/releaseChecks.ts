import { countCloneCreationBlocks, type SerializedLogicBlock, validateSerializedLogicBlock } from '../blockly/blockValidation';
import type { WorldReleaseCheckReasonCode as PersistedWorldReleaseCheckReasonCode } from '../database.types';
import { isTrustedAssetUrl } from '../models/modelPolicy';
import { ProjectCommandSchema } from '../projects/commandSchema';
import { hashProjectSnapshot, type ProjectSnapshot, type SnapshotLogicBlock } from '../projects/projectSnapshot';
import { keywordScan } from '../safety/keyword-scan';
import { getWorldTemplate, type WorldTemplate } from './templates';
import { validateWorldTemplate } from './templateValidation';

export const WORLD_RELEASE_CHECK_NAMES = [
  'snapshot_integrity',
  'template_identity',
  'project_budgets',
  'asset_policy',
  'block_policy',
  'playability',
  'public_metadata',
] as const;

export type WorldReleaseCheckName = (typeof WORLD_RELEASE_CHECK_NAMES)[number];
export type WorldReleaseCheckStatus = 'passed' | 'failed' | 'error';

/**
 * These codes are deliberately small, stable identifiers. They can be stored
 * or shown in an operator-only surface without copying creator source text,
 * untrusted URLs, parser errors, or moderation-provider details.
 */
export type WorldReleaseCheckReasonCode = PersistedWorldReleaseCheckReasonCode;

export interface WorldReleaseCheckResult {
  name: WorldReleaseCheckName;
  status: WorldReleaseCheckStatus;
  reasonCode: WorldReleaseCheckReasonCode | null;
}

export interface ReleaseCheckContext {
  templateId: string;
  templateVersion: number;
  /** Revision captured in the immutable project_play_snapshots row. */
  sourceRevision: number;
  /** SHA-256 stored with the immutable project_play_snapshots row. */
  snapshotHash: string;
  /** Server-derived display label only; never a profile or account identifier. */
  creatorLabel: string;
  /** Trusted `assets.file_size` values keyed by immutable snapshot asset ID. */
  assetByteSizes: Readonly<Record<string, number>>;
  /**
   * The service passes the existing moderation boundary here. It is optional
   * for pure deterministic callers, which still receive strict structural
   * sanitization and URL checks. A provider failure becomes `check_error`.
   */
  moderateText?: (text: string) => Promise<{ safe: boolean }>;
}

function passed(name: WorldReleaseCheckName): WorldReleaseCheckResult {
  return { name, status: 'passed', reasonCode: null };
}

function failed(name: WorldReleaseCheckName, reasonCode: WorldReleaseCheckReasonCode): WorldReleaseCheckResult {
  return { name, status: 'failed', reasonCode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function templateFor(context: ReleaseCheckContext): WorldTemplate | null {
  const template = getWorldTemplate(context.templateId, context.templateVersion);
  return template ?? null;
}

/** Validates the immutable row's source revision and canonical SHA-256. */
export function checkSnapshotIntegrity(
  snapshot: ProjectSnapshot,
  context: ReleaseCheckContext,
): WorldReleaseCheckResult {
  if (snapshot.project.revision !== context.sourceRevision) {
    return failed('snapshot_integrity', 'snapshot_revision_mismatch');
  }
  if (hashProjectSnapshot(snapshot) !== context.snapshotHash) {
    return failed('snapshot_integrity', 'snapshot_hash_mismatch');
  }
  return passed('snapshot_integrity');
}

/** Requires the exact catalog version to remain approved and internally valid. */
export function checkTemplateIdentity(
  _snapshot: ProjectSnapshot,
  context: ReleaseCheckContext,
): WorldReleaseCheckResult {
  const template = templateFor(context);
  if (!template?.active) return failed('template_identity', 'template_not_active');
  if (validateWorldTemplate(template).length > 0) return failed('template_identity', 'template_invalid');
  return passed('template_identity');
}

interface SnapshotBlockTree {
  blockType: string;
  data: Record<string, unknown>;
}

function snapshotBlockTrees(blocks: readonly SnapshotLogicBlock[]): SnapshotBlockTree[] | null {
  const trees: SnapshotBlockTree[] = [];
  for (const block of blocks) {
    const data = parseJsonRecord(block.block_data);
    if (!data) return null;
    trees.push({ blockType: block.block_type, data });
  }
  return trees;
}

function serializedBlockTrees(blocks: readonly SnapshotBlockTree[]): SerializedLogicBlock[] {
  return blocks.map((block) => ({
    block_type: block.blockType,
    children: block.data.children,
    elseChildren: block.data.elseChildren,
  }));
}

function countSnapshotBlocks(blocks: readonly SerializedLogicBlock[]): number {
  let count = 0;
  const walk = (items: readonly SerializedLogicBlock[]) => {
    for (const block of items) {
      count += 1;
      if (Array.isArray(block.children)) walk(block.children as SerializedLogicBlock[]);
      if (Array.isArray(block.elseChildren)) walk(block.elseChildren as SerializedLogicBlock[]);
    }
  };
  walk(blocks);
  return count;
}

/** Enforces the published budget profile without inspecting creator text. */
export function checkProjectBudgets(
  snapshot: ProjectSnapshot,
  context: ReleaseCheckContext,
): WorldReleaseCheckResult {
  const template = templateFor(context);
  if (!template?.active || validateWorldTemplate(template).length > 0) {
    return failed('project_budgets', 'template_budget_unavailable');
  }

  const objectCount = snapshot.scenes.reduce((count, scene) => count + scene.objects.length, 0);
  const blockLists = snapshot.scenes.flatMap((scene) => scene.objects.map((object) => snapshotBlockTrees(object.logic_blocks)));
  if (blockLists.some((blocks) => blocks === null)) return failed('project_budgets', 'budget_exceeded');
  const validBlockLists = (blockLists as SnapshotBlockTree[][]).map(serializedBlockTrees);
  const blockCount = validBlockLists.reduce((count, blocks) => count + countSnapshotBlocks(blocks), 0);
  const maximumScriptSteps = Math.max(0, ...validBlockLists.map((blocks) => countSnapshotBlocks(blocks)));
  const cloneBlockCount = validBlockLists.reduce((count, blocks) => count + countCloneCreationBlocks(blocks), 0);
  let assetBytes = 0;
  for (const asset of snapshot.assets) {
    const size = context.assetByteSizes[asset.id];
    if (!Number.isSafeInteger(size) || size < 0) return failed('project_budgets', 'asset_size_unavailable');
    assetBytes += size;
    if (!Number.isSafeInteger(assetBytes)) return failed('project_budgets', 'budget_exceeded');
  }
  const { budgets } = template;

  if (
    snapshot.scenes.length > budgets.maxScenes
    || objectCount > budgets.maxObjects
    || blockCount > budgets.maxBlocks
    || cloneBlockCount > budgets.maxClones
    || maximumScriptSteps > budgets.maxScriptStepsPerFrame
    || assetBytes > budgets.maxAssetBytes
  ) {
    return failed('project_budgets', 'budget_exceeded');
  }
  return passed('project_budgets');
}

function containsUnsafeAssetReference(value: unknown, visited = new WeakSet<object>()): boolean {
  if (typeof value === 'string') {
    return /^(?:https?:|\/)/i.test(value) && !isTrustedAssetUrl(value);
  }
  if (value === null || typeof value !== 'object') return false;
  if (visited.has(value)) return false;
  visited.add(value);
  return Object.values(value).some((item) => containsUnsafeAssetReference(item, visited));
}

function validSnapshotObjectForCommand(snapshot: ProjectSnapshot, sceneId: string, object: ProjectSnapshot['scenes'][number]['objects'][number]): boolean {
  const properties = parseJsonRecord(object.properties);
  if (object.properties !== null && properties === null) return false;
  return ProjectCommandSchema.safeParse({
    type: 'object.create',
    objectId: object.id,
    sceneId,
    name: object.name,
    objectType: object.type,
    ...(properties ? { properties } : {}),
  }).success;
}

/** Uses the existing model and command policies for every serialized asset URL. */
export function checkAssetPolicy(
  snapshot: ProjectSnapshot,
  _context: ReleaseCheckContext,
): WorldReleaseCheckResult {
  const topLevelUrls = [
    snapshot.project.thumbnail_url,
    ...snapshot.assets.map((asset) => asset.file_url),
    ...snapshot.scenes.map((scene) => scene.background_image_url),
  ];
  if (topLevelUrls.some((url) => typeof url === 'string' && !isTrustedAssetUrl(url))) {
    return failed('asset_policy', 'asset_url_invalid');
  }

  for (const scene of snapshot.scenes) {
    for (const object of scene.objects) {
      const properties = parseJsonRecord(object.properties);
      if (
        (object.properties !== null && properties === null)
        || containsUnsafeAssetReference(properties)
        || (object.sprite_url !== null && !isTrustedAssetUrl(object.sprite_url))
      ) {
        return failed('asset_policy', 'asset_url_invalid');
      }
      if (!validSnapshotObjectForCommand(snapshot, scene.id, object)) {
        return failed('asset_policy', 'asset_reference_invalid');
      }
    }
  }
  return passed('asset_policy');
}

/** Reuses the Blockly vocabulary and accepts only serialized runtime-shaped inputs. */
export function checkBlockPolicy(
  snapshot: ProjectSnapshot,
  _context: ReleaseCheckContext,
): WorldReleaseCheckResult {
  for (const scene of snapshot.scenes) {
    for (const object of scene.objects) {
      const blocks = snapshotBlockTrees(object.logic_blocks);
      if (!blocks) return failed('block_policy', 'block_data_invalid');
      for (const block of blocks) {
        const reason = validateSerializedLogicBlock(block.blockType, block.data);
        if (reason === 'unsupported_block_type') return failed('block_policy', 'block_type_unsupported');
        if (reason) return failed('block_policy', 'block_data_invalid');
      }
    }
  }
  return passed('block_policy');
}

function isPlayerControlled(properties: unknown): boolean {
  const parsed = parseJsonRecord(properties);
  return parsed?.playerControlled === true;
}

function hasMovementControls(blocks: readonly SnapshotLogicBlock[]): boolean {
  const types = blocks.map((block) => block.block_type);
  return types.some((type, index) => type === 'on_key_press' && types[index + 1] === 'move');
}

/** Checks the minimum scene/player contract needed by the headless runtime. */
export function checkPlayability(
  snapshot: ProjectSnapshot,
  _context: ReleaseCheckContext,
): WorldReleaseCheckResult {
  if (snapshot.scenes.length === 0) return failed('playability', 'scene_missing');
  const players = snapshot.scenes.flatMap((scene) => scene.objects).filter((object) =>
    object.type === 'character' && isPlayerControlled(object.properties),
  );
  if (players.length === 0) return failed('playability', 'player_missing');
  if (!players.some((player) => hasMovementControls(player.logic_blocks))) {
    return failed('playability', 'player_controls_missing');
  }
  return passed('playability');
}

function isSafePublicText(value: string, maximumLength: number): boolean {
  if (value.length === 0 || value.length > maximumLength || value !== value.trim()) return false;
  if (/<\/?[A-Za-z][^>]*>|javascript:|\bon\w+\s*=/i.test(value)) return false;
  return !/(?:https?:\/\/|www\.)/i.test(value);
}

/** Rejects unsanitized, link-bearing, oversized, or externally flagged public metadata. */
export async function checkPublicMetadata(
  snapshot: ProjectSnapshot,
  context: ReleaseCheckContext,
): Promise<WorldReleaseCheckResult> {
  const { title, description } = snapshot.project;
  if (
    !isSafePublicText(title, 120)
    || (description !== null && !isSafePublicText(description, 2_000))
    || !isSafePublicText(context.creatorLabel, 120)
  ) {
    return failed('public_metadata', 'metadata_invalid');
  }
  if (keywordScan([title, description ?? '', context.creatorLabel].join('\n')).flagged) {
    return failed('public_metadata', 'metadata_moderation_failed');
  }
  if (context.moderateText) {
    const moderation = await context.moderateText([title, description ?? '', context.creatorLabel].join('\n'));
    if (!moderation.safe) return failed('public_metadata', 'metadata_moderation_failed');
  }
  return passed('public_metadata');
}

type CheckRunner = (snapshot: ProjectSnapshot, context: ReleaseCheckContext) => WorldReleaseCheckResult | Promise<WorldReleaseCheckResult>;

async function runFailClosed(
  name: WorldReleaseCheckName,
  runner: CheckRunner,
  snapshot: ProjectSnapshot,
  context: ReleaseCheckContext,
): Promise<WorldReleaseCheckResult> {
  try {
    return await runner(snapshot, context);
  } catch {
    return { name, status: 'error', reasonCode: 'check_error' };
  }
}

/**
 * Runs each release gate in a fixed order. Callers must require every result
 * to be `passed`; a single failure or unexpected exception is non-reviewable.
 */
export async function runWorldReleaseChecks(
  snapshot: ProjectSnapshot,
  context: ReleaseCheckContext,
): Promise<ReadonlyArray<WorldReleaseCheckResult>> {
  return Promise.all([
    runFailClosed('snapshot_integrity', checkSnapshotIntegrity, snapshot, context),
    runFailClosed('template_identity', checkTemplateIdentity, snapshot, context),
    runFailClosed('project_budgets', checkProjectBudgets, snapshot, context),
    runFailClosed('asset_policy', checkAssetPolicy, snapshot, context),
    runFailClosed('block_policy', checkBlockPolicy, snapshot, context),
    runFailClosed('playability', checkPlayability, snapshot, context),
    runFailClosed('public_metadata', checkPublicMetadata, snapshot, context),
  ]);
}

/** A candidate can enter review only after the complete fixed check set passes. */
export function isWorldReleaseReviewable(results: readonly WorldReleaseCheckResult[]): boolean {
  return results.length === WORLD_RELEASE_CHECK_NAMES.length
    && results.every((result, index) => result.name === WORLD_RELEASE_CHECK_NAMES[index] && result.status === 'passed');
}
