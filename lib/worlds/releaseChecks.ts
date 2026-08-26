import { BLOCK_SPECS } from '../blockly/definitions';
import { isTrustedModelUrl } from '../models/modelPolicy';
import { ProjectCommandSchema } from '../projects/commandSchema';
import { canonicalStringify, hashProjectSnapshot, type ProjectSnapshot, type SnapshotLogicBlock } from '../projects/projectSnapshot';
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
export type WorldReleaseCheckReasonCode =
  | 'snapshot_hash_mismatch'
  | 'snapshot_revision_mismatch'
  | 'template_not_active'
  | 'template_invalid'
  | 'template_budget_unavailable'
  | 'budget_exceeded'
  | 'asset_url_invalid'
  | 'asset_reference_invalid'
  | 'block_type_unsupported'
  | 'block_data_invalid'
  | 'scene_missing'
  | 'player_missing'
  | 'player_controls_missing'
  | 'metadata_invalid'
  | 'metadata_moderation_failed'
  | 'check_error';

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

interface SnapshotBlock {
  blockType: string;
  data: Record<string, unknown> | null;
}

function nestedBlocks(value: unknown, into: SnapshotBlock[]): void {
  if (!Array.isArray(value)) return;
  for (const block of value) {
    if (!isRecord(block)) {
      into.push({ blockType: '', data: null });
      continue;
    }
    const blockType = typeof block.block_type === 'string' ? block.block_type : '';
    const data = {
      inputs: block.inputs,
      children: block.children,
      elseChildren: block.elseChildren,
    };
    into.push({ blockType, data });
    nestedBlocks(block.children, into);
    nestedBlocks(block.elseChildren, into);
  }
}

function snapshotBlocks(blocks: readonly SnapshotLogicBlock[]): SnapshotBlock[] {
  const collected: SnapshotBlock[] = [];
  for (const block of blocks) {
    const data = parseJsonRecord(block.block_data);
    collected.push({ blockType: block.block_type, data });
    if (data) {
      nestedBlocks(data.children, collected);
      nestedBlocks(data.elseChildren, collected);
    }
  }
  return collected;
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
  const blockLists = snapshot.scenes.flatMap((scene) => scene.objects.map((object) => snapshotBlocks(object.logic_blocks)));
  const blockCount = blockLists.reduce((count, blocks) => count + blocks.length, 0);
  const maximumScriptSteps = Math.max(0, ...blockLists.map((blocks) => blocks.length));
  const snapshotBytes = Buffer.byteLength(canonicalStringify(snapshot), 'utf8');
  const { budgets } = template;

  if (
    snapshot.scenes.length > budgets.maxScenes
    || objectCount > budgets.maxObjects
    || blockCount > budgets.maxBlocks
    || maximumScriptSteps > budgets.maxScriptStepsPerFrame
    || snapshot.assets.length > budgets.maxObjects
    || snapshotBytes > budgets.maxAssetBytes
  ) {
    return failed('project_budgets', 'budget_exceeded');
  }
  return passed('project_budgets');
}

const LOCAL_MEDIA_EXTENSIONS = new Set([
  'avif', 'dae', 'fbx', 'gif', 'glb', 'gltf', 'jpeg', 'jpg', 'mp3', 'ogg',
  'obj', 'png', 'stl', 'svg', 'wav', 'webp',
]);

function isApprovedLocalMediaUrl(value: string): boolean {
  if (!value.startsWith('/')) return false;
  const path = value.split(/[?#]/, 1)[0];
  if (!/^\/(?:models|uploads|backdrops)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)) return false;
  if (path.includes('..') || path.includes('//')) return false;
  const extension = path.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  return extension !== undefined && LOCAL_MEDIA_EXTENSIONS.has(extension);
}

function isApprovedAssetUrl(value: string): boolean {
  return isTrustedModelUrl(value) || isApprovedLocalMediaUrl(value);
}

function containsUnsafeAssetReference(value: unknown, visited = new WeakSet<object>()): boolean {
  if (typeof value === 'string') {
    return /^(?:https?:|\/)/i.test(value) && !isApprovedAssetUrl(value);
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
  if (topLevelUrls.some((url) => typeof url === 'string' && !isApprovedAssetUrl(url))) {
    return failed('asset_policy', 'asset_url_invalid');
  }

  for (const scene of snapshot.scenes) {
    for (const object of scene.objects) {
      const properties = parseJsonRecord(object.properties);
      if (
        (object.properties !== null && properties === null)
        || containsUnsafeAssetReference(properties)
        || (object.sprite_url !== null && !isApprovedAssetUrl(object.sprite_url))
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

function isExpression(value: unknown): boolean {
  if (!isRecord(value) || typeof value.op !== 'string') return false;
  if (value.value !== undefined && value.value !== null && typeof value.value === 'object') return false;
  return value.args === undefined || (Array.isArray(value.args) && value.args.every(isExpression));
}

function validBlockInput(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value) || isExpression(value);
}

function validSerializedBlock(block: SnapshotBlock): WorldReleaseCheckReasonCode | null {
  const spec = BLOCK_SPECS[block.blockType];
  if (!spec) return 'block_type_unsupported';
  if (!block.data) return 'block_data_invalid';
  const inputsValue = block.data.inputs;
  if (inputsValue !== undefined && !isRecord(inputsValue)) return 'block_data_invalid';
  const inputs = inputsValue ?? {};
  const allowedInputs = new Set([...spec.fields, ...spec.values]);
  if (Object.keys(inputs).some((name) => !allowedInputs.has(name))) return 'block_data_invalid';
  if (Object.values(inputs).some((value) => !validBlockInput(value))) return 'block_data_invalid';
  return null;
}

/** Reuses the Blockly vocabulary and accepts only serialized runtime-shaped inputs. */
export function checkBlockPolicy(
  snapshot: ProjectSnapshot,
  _context: ReleaseCheckContext,
): WorldReleaseCheckResult {
  for (const scene of snapshot.scenes) {
    for (const object of scene.objects) {
      for (const block of snapshotBlocks(object.logic_blocks)) {
        const reasonCode = validSerializedBlock(block);
        if (reasonCode) return failed('block_policy', reasonCode);
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
