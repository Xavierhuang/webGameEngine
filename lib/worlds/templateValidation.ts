import { BLOCK_SPECS } from '../blockly/definitions';
import { validateSkyStepsFlagship } from './skyStepsContract';
import type { WorldTemplate, WorldTemplateBlock, WorldTemplateBudget } from './templates';

export interface ValidationIssue {
  code:
    | 'budget_exceeded'
    | 'duplicate_id'
    | 'empty_objects'
    | 'empty_scenes'
    | 'invalid_budget'
    | 'invalid_metadata'
    | 'invalid_mission'
    | 'invalid_object_type'
    | 'invalid_structure'
    | 'invalid_version'
    | 'missing_player'
    | 'unsafe_asset_path'
    | 'unsupported_block_type';
  path: string;
  message: string;
}

const MAXIMUM_BUDGETS: WorldTemplateBudget = {
  maxScenes: 3,
  maxObjects: 30,
  maxBlocks: 160,
  maxClones: 20,
  maxAssetBytes: 16 * 1024 * 1024,
  maxScriptStepsPerFrame: 120,
};

function isApprovedAssetPath(value: unknown): value is string {
  return typeof value === 'string'
    && /^\/(?:models|backdrops)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.includes('..')
    && !value.includes('//');
}

function addDuplicateIssue(ids: Set<string>, id: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof id !== 'string' || !id || ids.has(id)) {
    issues.push({ code: 'duplicate_id', path, message: `Duplicate or missing id at ${path}` });
    return;
  }
  ids.add(id);
}

const WORLD_TEMPLATE_OBJECT_TYPES = new Set([
  'character', 'platform', 'collectible', 'obstacle', 'sprite', 'sound',
]);

function isWorldTemplateObjectType(value: unknown): boolean {
  return typeof value === 'string' && WORLD_TEMPLATE_OBJECT_TYPES.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isReadable(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateBudget(budget: unknown, issues: ValidationIssue[]): void {
  const values = isRecord(budget) ? budget : {};
  for (const [key, maximum] of Object.entries(MAXIMUM_BUDGETS) as [keyof WorldTemplateBudget, number][]) {
    const value = values[key];
    if (!Number.isInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
      issues.push({ code: 'invalid_budget', path: `budgets.${key}`, message: `${key} must be a positive integer no larger than ${maximum}` });
    }
  }
}

function validateAsset(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isApprovedAssetPath(value)) {
    issues.push({ code: 'unsafe_asset_path', path, message: `Asset path at ${path} must be an approved local model or backdrop` });
  }
}

function hasSupportedBlockType(value: unknown): value is string {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BLOCK_SPECS, value);
}

function hasPlayerControls(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false;
  return blocks.some((block, index) =>
    isRecord(block)
    && block.block_type === 'on_key_press'
    && isRecord(blocks[index + 1])
    && blocks[index + 1].block_type === 'move'
  );
}

function validateBlocks(
  blocks: unknown,
  path: string,
  blockIds: Set<string>,
  issues: ValidationIssue[],
  required: boolean,
): number {
  if (!Array.isArray(blocks)) {
    if (required || blocks !== undefined) {
      issues.push({ code: 'invalid_structure', path, message: `Block list at ${path} must be an array` });
    }
    return 0;
  }

  let count = 0;
  for (const [index, block] of blocks.entries()) {
    const blockPath = `${path}[${index}]`;
    count += 1;
    if (!isRecord(block)) {
      issues.push({ code: 'invalid_structure', path: blockPath, message: `Block at ${blockPath} must be an object` });
      continue;
    }
    addDuplicateIssue(blockIds, block.id, `${blockPath}.id`, issues);
    if (!hasSupportedBlockType(block.block_type)) {
      issues.push({ code: 'unsupported_block_type', path: `${blockPath}.block_type`, message: `Unsupported block type ${String(block.block_type)}` });
    }
    count += validateBlocks(block.children, `${blockPath}.children`, blockIds, issues, false);
    count += validateBlocks(block.elseChildren, `${blockPath}.elseChildren`, blockIds, issues, false);
  }
  return count;
}

/** Validate the full data graph before a template can create a project. */
export function validateWorldTemplate(template: WorldTemplate): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sceneIds = new Set<string>();
  const objectIds = new Set<string>();
  const missionIds = new Set<string>();
  const blockIds = new Set<string>();
  const templateValue: Record<string, unknown> = isRecord(template) ? template : {};
  const scenes = Array.isArray(templateValue.scenes) ? templateValue.scenes : [];
  const missions = Array.isArray(templateValue.missions) ? templateValue.missions : [];

  if (!isReadable(templateValue.id) || !isReadable(templateValue.title) || !isReadable(templateValue.description)
    || !isReadable(templateValue.genre) || !isReadable(templateValue.cardArt)) {
    issues.push({ code: 'invalid_metadata', path: 'template', message: 'Template id, title, description, genre, and card art must be readable text' });
  }
  if (!Number.isInteger(templateValue.version) || Number(templateValue.version) <= 0) {
    issues.push({ code: 'invalid_version', path: 'version', message: 'Template version must be a positive integer' });
  }
  if (!Array.isArray(templateValue.scenes)) {
    issues.push({ code: 'invalid_structure', path: 'scenes', message: 'Template scenes must be an array' });
  }
  if (!Array.isArray(templateValue.missions)) {
    issues.push({ code: 'invalid_structure', path: 'missions', message: 'Template missions must be an array' });
  }

  validateBudget(templateValue.budgets, issues);
  validateAsset(templateValue.cardArt, 'cardArt', issues);

  if (scenes.length === 0) {
    issues.push({ code: 'empty_scenes', path: 'scenes', message: 'A world template needs at least one scene' });
  }

  let objectCount = 0;
  let blockCount = 0;
  let cloneBlockCount = 0;
  let hasPlayer = false;

  for (const [sceneIndex, scene] of scenes.entries()) {
    const scenePath = `scenes[${sceneIndex}]`;
    if (!isRecord(scene)) {
      issues.push({ code: 'invalid_structure', path: scenePath, message: `Scene at ${scenePath} must be an object` });
      continue;
    }
    addDuplicateIssue(sceneIds, scene.id, `${scenePath}.id`, issues);
    validateAsset(scene.backgroundImageUrl, `${scenePath}.backgroundImageUrl`, issues);
    const objects = Array.isArray(scene.objects) ? scene.objects : [];
    if (!Array.isArray(scene.objects)) {
      issues.push({ code: 'invalid_structure', path: `${scenePath}.objects`, message: 'Scene objects must be an array' });
    }
    if (objects.length === 0) {
      issues.push({ code: 'empty_objects', path: `${scenePath}.objects`, message: 'Each scene needs at least one object' });
    }

    for (const [objectIndex, object] of objects.entries()) {
      const objectPath = `${scenePath}.objects[${objectIndex}]`;
      objectCount += 1;
      if (!isRecord(object)) {
        issues.push({ code: 'invalid_structure', path: objectPath, message: `Object at ${objectPath} must be an object` });
        continue;
      }
      addDuplicateIssue(objectIds, object.id, `${objectPath}.id`, issues);
      if (!WORLD_TEMPLATE_OBJECT_TYPES.has(String(object.type))) {
        issues.push({ code: 'invalid_object_type', path: `${objectPath}.type`, message: `Unsupported object type ${String(object.type)}` });
      }
      hasPlayer = hasPlayer || (
        object.type === 'character'
        && object.playerControlled === true
        && hasPlayerControls(object.blocks)
      );
      if (object.modelUrl !== undefined) validateAsset(object.modelUrl, `${objectPath}.modelUrl`, issues);
      blockCount += validateBlocks(object.blocks, `${objectPath}.blocks`, blockIds, issues, true);
      walkBlocks(object.blocks, (block) => { if (block.block_type === 'create_clone_of') cloneBlockCount += 1; });
    }
  }

  if (missions.length < 3 || missions.length > 5) {
    issues.push({ code: 'invalid_mission', path: 'missions', message: 'A world template needs three to five missions' });
  }
  for (const [missionIndex, mission] of missions.entries()) {
    const missionPath = `missions[${missionIndex}]`;
    if (!isRecord(mission)) {
      issues.push({ code: 'invalid_mission', path: missionPath, message: `Mission at ${missionPath} must be an object` });
      continue;
    }
    addDuplicateIssue(missionIds, mission.id, `${missionPath}.id`, issues);
    if (!isReadable(mission.id) || !isReadable(mission.title) || !isReadable(mission.description)) {
      issues.push({ code: 'invalid_mission', path: missionPath, message: 'Mission id, title, and description must be readable text' });
    }
    if (mission.kind === 'object_present') {
      if (mission.objectType !== undefined && !isWorldTemplateObjectType(mission.objectType)) {
        issues.push({ code: 'invalid_mission', path: `${missionPath}.objectType`, message: 'An object_present mission needs a supported post-baseline object type' });
      }
      if (mission.objectType === undefined && (typeof mission.objectId !== 'string' || !objectIds.has(mission.objectId))) {
        issues.push({ code: 'invalid_mission', path: `${missionPath}.objectId`, message: 'An object_present mission must reference a template object or name a post-baseline object type' });
      }
    } else if (mission.kind === 'block_present') {
      if (!hasSupportedBlockType(mission.blockType)) {
        issues.push({ code: 'invalid_mission', path: `${missionPath}.blockType`, message: 'A block_present mission must name a supported block' });
      }
    } else if (mission.kind === 'outcome_reached') {
      if (mission.outcome !== 'win' && mission.outcome !== 'fun') {
        issues.push({ code: 'invalid_mission', path: `${missionPath}.outcome`, message: 'An outcome_reached mission needs a supported outcome' });
      }
    } else if (mission.kind !== 'play_started') {
      issues.push({ code: 'invalid_mission', path: `${missionPath}.kind`, message: 'A mission needs a supported completion kind' });
    }
  }

  if (!hasPlayer) {
    issues.push({ code: 'missing_player', path: 'scenes', message: 'A world template needs a player-controlled character with a key movement script' });
  }
  const budgets = isRecord(templateValue.budgets) ? templateValue.budgets : {};
  if (scenes.length > Number(budgets.maxScenes)) {
    issues.push({ code: 'budget_exceeded', path: 'scenes', message: `Scene count ${scenes.length} exceeds the template budget` });
  }
  if (objectCount > Number(budgets.maxObjects)) {
    issues.push({ code: 'budget_exceeded', path: 'scenes', message: `Object count ${objectCount} exceeds the template budget` });
  }
  if (blockCount > Number(budgets.maxBlocks)) {
    issues.push({ code: 'budget_exceeded', path: 'scenes', message: `Block count ${blockCount} exceeds the template budget` });
  }
  if (cloneBlockCount > Number(budgets.maxClones)) {
    issues.push({ code: 'budget_exceeded', path: 'scenes', message: `Clone count ${cloneBlockCount} exceeds the template budget` });
  }

  if (templateValue.id === 'platformer' && templateValue.version === 2) {
    for (const message of validateSkyStepsFlagship(template)) {
      issues.push({ code: 'invalid_metadata', path: 'skySteps', message });
    }
  }

  return issues;
}

function walkBlocks(blocks: unknown, visitor: (block: WorldTemplateBlock) => void): void {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    visitor(block as unknown as WorldTemplateBlock);
    walkBlocks(block.children, visitor);
    walkBlocks(block.elseChildren, visitor);
  }
}
