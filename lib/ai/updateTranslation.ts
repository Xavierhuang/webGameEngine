import { randomUUID } from 'crypto';
import type { ProjectCommand } from '../projects/commandSchema';

/**
 * Turns the small, child-facing AI update vocabulary into the same validated
 * project commands used by the editor.  This module deliberately does not
 * write to the database: the route supplies a current project graph, then
 * passes the resulting command through the command service for authorization,
 * revision locking, idempotency, and audit history.
 */

type JsonRecord = Record<string, unknown>;

export interface AiProjectGraph {
  scenes: Array<{
    id: string;
    name?: string;
    game_objects?: AiProjectObject[];
    objects?: AiProjectObject[];
  }>;
}

export interface AiProjectObject {
  id: string;
  name: string;
  logic_blocks?: Array<{
    id?: string;
    block_type?: string;
    category?: string;
    parent_block_id?: string | null;
    order_index?: number;
    block_data?: unknown;
  }>;
}

export interface AiUpdateTranslationOptions {
  newId?: () => string;
}

export type AiUpdateTranslationErrorCode =
  | 'invalid_update'
  | 'unsupported_update'
  | 'scene_not_found'
  | 'target_not_found'
  | 'ambiguous_target';

export class AiUpdateTranslationError extends Error {
  constructor(
    public readonly code: AiUpdateTranslationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiUpdateTranslationError';
  }
}

const OBJECT_TYPES = new Set([
  'character',
  'platform',
  'collectible',
  'obstacle',
  'sprite',
  'sound',
  'particles',
]);

const SHAPES = new Set([
  'box',
  'sphere',
  'cylinder',
  'cone',
  'pyramid',
  'torus',
  'capsule',
  'plane',
  'model',
  'circle',
  'particles',
]);

const COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]{1,64}\))$/;
const BLOCK_TYPE = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_COORDINATE = 1_000_000;
const MAX_AI_BLOCKS = 50;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: AiUpdateTranslationErrorCode, message: string): never {
  throw new AiUpdateTranslationError(code, message);
}

function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, value));
}

function optionalVec3(value: unknown): { x: number; y: number; z: number } | undefined {
  if (!isRecord(value)) return undefined;
  const values = [value.x, value.y, value.z];
  if (!values.some((axis) => typeof axis === 'number' && Number.isFinite(axis))) return undefined;
  return {
    x: finiteNumber(value.x, 0),
    y: finiteNumber(value.y, 0),
    z: finiteNumber(value.z, 0),
  };
}

function safeJson(value: unknown, depth = 0): unknown {
  if (depth > 16) fail('invalid_update', 'AI update is nested too deeply.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > 4_000) fail('invalid_update', 'AI update contains text that is too long.');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid_update', 'AI update contains an invalid number.');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 250) fail('invalid_update', 'AI update contains too many items.');
    return value.map((item) => safeJson(item, depth + 1));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > 100) fail('invalid_update', 'AI update contains too many fields.');
    const out: JsonRecord = {};
    for (const [key, child] of entries) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      out[key] = safeJson(child, depth + 1);
    }
    return out;
  }
  fail('invalid_update', 'AI update contains an unsupported value.');
}

function propertiesFrom(candidate: JsonRecord): JsonRecord {
  const supplied = isRecord(candidate.properties) ? candidate.properties : {};
  const result: JsonRecord = {};

  const position = optionalVec3(candidate.position ?? supplied.position) ?? (
    [candidate.position_x, candidate.position_y, candidate.position_z]
      .some((axis) => typeof axis === 'number' && Number.isFinite(axis))
      ? {
          x: finiteNumber(candidate.position_x, 0),
          y: finiteNumber(candidate.position_y, 0),
          z: finiteNumber(candidate.position_z, 0),
        }
      : undefined
  );
  if (position) result.position = position;

  const rotation = optionalVec3(candidate.rotation ?? supplied.rotation);
  if (rotation) result.rotation = rotation;

  const scale = optionalVec3(candidate.scale ?? supplied.scale);
  if (scale && scale.x > 0 && scale.y > 0 && scale.z > 0) result.scale = scale;

  const color = candidate.color ?? supplied.color ?? (isRecord(candidate.sprite_data) ? candidate.sprite_data.color : undefined);
  if (typeof color === 'string' && COLOR.test(color)) result.color = color;

  const shape = candidate.shape ?? supplied.shape ?? (isRecord(candidate.sprite_data) ? candidate.sprite_data.shape : undefined);
  if (typeof shape === 'string' && SHAPES.has(shape)) result.shape = shape;

  const size = candidate.size ?? supplied.size ?? (isRecord(candidate.sprite_data) ? candidate.sprite_data.size : undefined);
  if (typeof size === 'number' && Number.isFinite(size) && size > 0 && size <= MAX_COORDINATE) {
    result.size = size;
  } else if (isRecord(size)) {
    result.size = safeJson(size);
  }

  const modelUrl = candidate.model_url ?? candidate.modelUrl ?? supplied.modelUrl ?? supplied.model_url;
  if (typeof modelUrl === 'string' && modelUrl.length > 0 && modelUrl.length <= 2_048) {
    result.modelUrl = modelUrl;
  }

  return result;
}

function normalizeObjectType(value: unknown): 'character' | 'platform' | 'collectible' | 'obstacle' | 'sprite' | 'sound' | 'particles' {
  if (typeof value !== 'string' || value.trim() === '') return 'sprite';
  const normalized = value.trim().toLowerCase();
  if (OBJECT_TYPES.has(normalized)) return normalized as ReturnType<typeof normalizeObjectType>;
  const aliases: Record<string, ReturnType<typeof normalizeObjectType>> = {
    coin: 'collectible',
    gem: 'collectible',
    star: 'collectible',
    ground: 'platform',
    wall: 'platform',
    hazard: 'obstacle',
    npc: 'character',
  };
  if (aliases[normalized]) return aliases[normalized];
  fail('invalid_update', 'AI requested an object type LingPlay does not support.');
}

function sceneFor(graph: AiProjectGraph, requestedId: unknown): string {
  const requested = typeof requestedId === 'string' && requestedId.length > 0 ? requestedId : undefined;
  if (requested) {
    if (!graph.scenes.some((scene) => scene.id === requested)) {
      fail('scene_not_found', 'The AI picked a scene that is not in this game.');
    }
    return requested;
  }
  const first = graph.scenes[0];
  if (!first) fail('scene_not_found', 'This game does not have a scene yet.');
  return first.id;
}

function parseExistingBlock(block: NonNullable<AiProjectObject['logic_blocks']>[number]): JsonRecord {
  let data: JsonRecord = {};
  if (typeof block.block_data === 'string') {
    try {
      const parsed = JSON.parse(block.block_data);
      if (isRecord(parsed)) data = safeJson(parsed) as JsonRecord;
    } catch {
      // A malformed historic block is kept as its stable table metadata below,
      // rather than allowing its raw data to break a new AI edit.
    }
  } else if (isRecord(block.block_data)) {
    data = safeJson(block.block_data) as JsonRecord;
  }

  return {
    ...data,
    ...(typeof block.id === 'string' ? { id: block.id } : {}),
    block_type: typeof block.block_type === 'string' ? block.block_type : String(data.block_type ?? 'unknown'),
    category: typeof block.category === 'string' ? block.category : String(data.category ?? 'general'),
    ...(typeof block.parent_block_id === 'string' ? { parent_block_id: block.parent_block_id } : {}),
    ...(typeof block.order_index === 'number' ? { order_index: block.order_index } : {}),
  };
}

function parseNewBlock(value: unknown, newId: () => string): JsonRecord {
  if (!isRecord(value)) fail('invalid_update', 'AI produced an invalid logic block.');
  const base = isRecord(value.block_data) ? safeJson(value.block_data) as JsonRecord
    : isRecord(value.data) ? safeJson(value.data) as JsonRecord
      : {};
  const blockType = value.block_type ?? value.type;
  if (typeof blockType !== 'string' || !BLOCK_TYPE.test(blockType)) {
    fail('invalid_update', 'AI produced a logic block without a valid type.');
  }

  const category = value.category;
  const block: JsonRecord = {
    ...base,
    id: newId(),
    block_type: blockType,
  };
  if (typeof category === 'string' && category.length <= 64) block.category = category;
  if (value.inputs !== undefined) block.inputs = safeJson(value.inputs);
  if (value.children !== undefined) block.children = safeJson(value.children);
  if (value.elseChildren !== undefined) block.elseChildren = safeJson(value.elseChildren);
  return block;
}

function objectFor(graph: AiProjectGraph, target: unknown): AiProjectObject {
  if (typeof target !== 'string' || target.trim() === '') {
    fail('invalid_update', 'AI did not say which object should receive the logic.');
  }
  const wanted = target.trim().toLocaleLowerCase();
  const matches = graph.scenes.flatMap((scene) => scene.game_objects ?? scene.objects ?? [])
    .filter((object) => object.name.trim().toLocaleLowerCase() === wanted);
  if (matches.length === 0) fail('target_not_found', `I could not find “${target.trim()}” in this game.`);
  if (matches.length > 1) fail('ambiguous_target', `More than one object is named “${target.trim()}”. Rename one, then try again.`);
  return matches[0];
}

function translateObjectCreate(
  update: JsonRecord,
  graph: AiProjectGraph,
  newId: () => string,
): ProjectCommand[] | null {
  let candidate: JsonRecord | null = null;
  let requestedScene: unknown = update.scene_id;

  if (update.type === 'add_game_object' && isRecord(update.game_object)) {
    candidate = update.game_object;
  } else if (update.type === 'create' && update.target === 'gameObject' && isRecord(update.data)) {
    candidate = update.data;
  } else if (isRecord(update.new_game_object)) {
    candidate = update.new_game_object;
  }
  if (!candidate) return null;
  requestedScene = requestedScene ?? candidate.scene_id ?? candidate.sceneId;
  if (Array.isArray(candidate.logic_blocks) && candidate.logic_blocks.length > 0) {
    fail('unsupported_update', 'AI can add an object or add code in one request, but not both together yet.');
  }

  const name = typeof candidate.name === 'string' && candidate.name.trim().length > 0
    ? candidate.name.trim().slice(0, 120)
    : 'New Object';
  return [{
    type: 'object.create',
    objectId: newId(),
    sceneId: sceneFor(graph, requestedScene),
    name,
    objectType: normalizeObjectType(candidate.type),
    properties: propertiesFrom(candidate),
  }];
}

/**
 * Translate one AI response into exactly one command.  Limiting this to one
 * command means a rejected command can never leave a half-applied AI batch.
 */
export function translateAiUpdate(
  update: unknown,
  graph: AiProjectGraph,
  options: AiUpdateTranslationOptions = {},
): ProjectCommand[] {
  if (!isRecord(update)) fail('invalid_update', 'AI did not return an update LingPlay can apply.');
  if (!Array.isArray(graph.scenes) || graph.scenes.length === 0) {
    fail('scene_not_found', 'This game does not have a scene yet.');
  }
  const newId = options.newId ?? randomUUID;

  const objectCreate = translateObjectCreate(update, graph, newId);
  if (objectCreate) return objectCreate;

  if (update.type === 'add_logic_blocks') {
    const target = objectFor(graph, update.target_object ?? update.targetObject);
    if (!Array.isArray(update.logic_blocks) || update.logic_blocks.length === 0) {
      fail('invalid_update', 'AI did not include any logic blocks to add.');
    }
    if (update.logic_blocks.length > MAX_AI_BLOCKS) {
      fail('invalid_update', 'AI tried to add too many logic blocks at once.');
    }
    const existing = (target.logic_blocks ?? []).map(parseExistingBlock);
    const additions = update.logic_blocks.map((block) => parseNewBlock(block, newId));
    return [{
      type: 'object.blocks.replace',
      objectId: target.id,
      workspaceJson: { blocks: [...existing, ...additions] },
    }];
  }

  fail('unsupported_update', 'That AI update is not supported yet. Try asking it to add one object or one set of controls.');
}
