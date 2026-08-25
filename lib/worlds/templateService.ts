import type { Pool } from 'mysql2/promise';
import type { Actor } from '../auth/actor';
import { withTransaction, type TransactionConnection } from '../mysql/transaction';
import { moderateText, sanitizeUserInput } from '../safety/moderation';
import { validateWorldTemplate } from './templateValidation';
import {
  getWorldTemplate,
  WORLD_TEMPLATES,
  type WorldTemplate,
  type WorldTemplateBlock,
} from './templates';
import { previewProjectFromTemplate } from './previewProject';
import type { Project } from '../../types/game';

type WorldActor = Exclude<Actor, { kind: 'anonymous' }>;

export interface CreateWorldFromTemplateInput {
  actor: Actor;
  templateId: string;
  templateVersion: number;
  title: string;
  description?: string;
}

export interface CreatedWorld {
  projectId: string;
  revision: number;
  templateId: string;
  templateVersion: number;
}

export interface CreateWorldFromTemplateOptions {
  /** Used by integration tests and local tools; request handlers use the default pool. */
  pool?: Pick<Pool, 'getConnection'>;
}

export class WorldTemplateCreationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 422,
  ) {
    super(message);
    this.name = 'WorldTemplateCreationError';
  }
}

export interface WorldTemplateDto {
  id: string;
  version: number;
  title: string;
  description: string;
  genre: string;
  cardArt: string;
  budgets: WorldTemplate['budgets'];
  missions: WorldTemplate['missions'];
}

/** Safe catalog projection for the template chooser; object graphs stay server-only. */
export function listWorldTemplateDtos(): WorldTemplateDto[] {
  const latestActiveTemplates = new Map<string, WorldTemplate>();
  for (const template of WORLD_TEMPLATES) {
    if (!template.active) continue;
    const current = latestActiveTemplates.get(template.id);
    if (!current || template.version > current.version) latestActiveTemplates.set(template.id, template);
  }
  return [...latestActiveTemplates.values()].map((template) => ({
    id: template.id,
    version: template.version,
    title: template.title,
    description: template.description,
    genre: template.genre,
    cardArt: template.cardArt,
    budgets: template.budgets,
    missions: template.missions,
  }));
}

/** The ordinary creation route accepts only versions its picker can offer. */
export function isWorldTemplateActive(templateId: string, templateVersion: number): boolean {
  return getWorldTemplate(templateId, templateVersion)?.active === true;
}

/**
 * Returns a transient runtime projection for a selected starter. The route
 * caller keeps it in browser memory only; it has no project row or owner.
 */
export function previewWorldTemplate(templateId: string, templateVersion: number): Project | null {
  const template = getWorldTemplate(templateId, templateVersion);
  if (!template?.active) return null;
  return previewProjectFromTemplate(template);
}

function requireNonAnonymousActor(actor: Actor): WorldActor {
  if (actor.kind === 'anonymous') {
    throw new WorldTemplateCreationError('Authentication required', 401);
  }
  return actor;
}

function safeText(value: unknown, maximumLength: number): string {
  return typeof value === 'string' ? sanitizeUserInput(value).slice(0, maximumLength) : '';
}

function blockCategory(blockType: string): string {
  if (blockType.startsWith('on_') || blockType.startsWith('when_')) return 'event';
  if (['forever', 'repeat', 'repeat_until', 'if_then', 'if_else', 'wait', 'wait_until', 'stop_all'].includes(blockType)) return 'control';
  if (blockType.includes('sound') || blockType.includes('volume') || blockType.includes('tempo')) return 'sound';
  if (blockType.startsWith('set_') || blockType.startsWith('change_') || blockType.includes('variable') || blockType.includes('list')) return 'data';
  if (['move', 'jump', 'rotate', 'camera_follow', 'you_win', 'game_over'].includes(blockType)) return 'action';
  return 'general';
}

function catalogMetadata(template: WorldTemplate) {
  return {
    title: template.title,
    description: template.description,
    genre: template.genre,
    cardArt: template.cardArt,
    budgets: template.budgets,
    missions: template.missions,
  };
}

function countTemplateBlockTypes(blocks: readonly WorldTemplateBlock[], counts: Record<string, number> = {}): Record<string, number> {
  for (const block of blocks) {
    counts[block.block_type] = (counts[block.block_type] ?? 0) + 1;
    if (block.children) countTemplateBlockTypes(block.children, counts);
    if (block.elseChildren) countTemplateBlockTypes(block.elseChildren, counts);
  }
  return counts;
}

function worldMetadata(template: WorldTemplate, initialObjectIds: readonly string[]) {
  return {
    templateTitle: template.title,
    templateGenre: template.genre,
    missionIds: template.missions.map((mission) => mission.id),
    baselineRevision: 0,
    initialObjectIds,
    baselineBlockTypeCounts: countTemplateBlockTypes(
      template.scenes.flatMap((scene) => scene.objects.flatMap((object) => object.blocks)),
    ),
  };
}

interface PersistedTemplateBlock {
  id: string;
  block_type: string;
  inputs?: Record<string, unknown>;
  children?: PersistedTemplateBlock[];
  elseChildren?: PersistedTemplateBlock[];
}

function serializeNestedTemplateBlock(block: WorldTemplateBlock): PersistedTemplateBlock {
  const persisted: PersistedTemplateBlock = {
    id: block.id,
    block_type: block.block_type,
  };
  if (block.inputs && Object.keys(block.inputs).length > 0) persisted.inputs = block.inputs;
  if (block.children?.length) persisted.children = block.children.map(serializeNestedTemplateBlock);
  if (block.elseChildren?.length) persisted.elseChildren = block.elseChildren.map(serializeNestedTemplateBlock);
  return persisted;
}

/**
 * Match the current serializer/runtime contract: nested statements are read
 * from the parent row's block_data, not rebuilt from relational parent IDs.
 */
export function serializeWorldTemplateBlock(block: WorldTemplateBlock): {
  inputs: Record<string, unknown>;
  children?: PersistedTemplateBlock[];
  elseChildren?: PersistedTemplateBlock[];
} {
  const persisted = serializeNestedTemplateBlock(block);
  return {
    inputs: persisted.inputs ?? {},
    ...(persisted.children ? { children: persisted.children } : {}),
    ...(persisted.elseChildren ? { elseChildren: persisted.elseChildren } : {}),
  };
}

async function insertBlocks({
  connection,
  blocks,
  projectId,
  sceneId,
  objectId,
}: {
  connection: TransactionConnection;
  blocks: readonly WorldTemplateBlock[];
  projectId: string;
  sceneId: string;
  objectId: string;
}): Promise<void> {
  const { randomUUID } = await import('crypto');
  for (const [orderIndex, block] of blocks.entries()) {
    const blockId = randomUUID();
    await connection.execute(
      `INSERT INTO logic_blocks
         (id, game_object_id, project_id, scene_id, block_type, category, parent_block_id, order_index, block_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        blockId,
        objectId,
        projectId,
        sceneId,
        block.block_type,
        blockCategory(block.block_type),
        null,
        orderIndex,
        JSON.stringify(serializeWorldTemplateBlock(block)),
      ],
    );
  }
}

/**
 * Create a complete private project graph from a server-owned, validated
 * catalog template. Callers can choose only template identity and moderated
 * project text; all object, block, and asset data comes from the catalog.
 */
export async function createWorldFromTemplate(
  input: CreateWorldFromTemplateInput,
  options?: CreateWorldFromTemplateOptions,
): Promise<CreatedWorld> {
  const actor = requireNonAnonymousActor(input.actor);
  const title = safeText(input.title, 50);
  const description = safeText(input.description ?? '', 500);
  if (!title) throw new WorldTemplateCreationError('Invalid title', 422);
  if (typeof input.templateId !== 'string' || !Number.isInteger(input.templateVersion)) {
    throw new WorldTemplateCreationError('Unknown template', 422);
  }

  const template = getWorldTemplate(input.templateId, input.templateVersion);
  if (!template || validateWorldTemplate(template).length > 0) {
    throw new WorldTemplateCreationError('Unknown template', 422);
  }

  const moderation = await moderateText(
    `${title}\n${description}`,
    actor.kind === 'user' ? actor.userId : null,
    actor.kind === 'guest' ? actor.profileId : null,
  );
  if (!moderation.safe) throw new WorldTemplateCreationError('Content moderation failed', 422);

  const { randomUUID } = await import('crypto');
  const projectId = randomUUID();
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO world_templates (template_id, version, catalog_metadata, active)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE catalog_metadata = VALUES(catalog_metadata), active = VALUES(active)`,
      [template.id, template.version, JSON.stringify(catalogMetadata(template)), template.active],
    );
    await connection.execute(
      `INSERT INTO projects
         (id, owner_id, title, description, genre, visibility, is_published, moderation_status, revision)
       VALUES (?, ?, ?, ?, ?, 'private', FALSE, 'draft', 0)`,
      [projectId, actor.profileId, title, description || null, template.genre],
    );
    const initialObjectIds: string[] = [];
    for (const [sceneOrder, scene] of template.scenes.entries()) {
      const sceneId = randomUUID();
      await connection.execute(
        `INSERT INTO scenes (id, project_id, name, order_index, background_color, background_image_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sceneId, projectId, scene.name, sceneOrder, scene.backgroundColor, scene.backgroundImageUrl],
      );
      for (const [objectOrder, object] of scene.objects.entries()) {
        const objectId = randomUUID();
        initialObjectIds.push(objectId);
        await connection.execute(
          `INSERT INTO game_objects
             (id, scene_id, type, name, position_x, position_y, position_z, color, properties, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            objectId,
            sceneId,
            object.type,
            object.name,
            object.position[0],
            object.position[1],
            object.position[2],
            object.color ?? null,
            JSON.stringify({
              shape: object.shape ?? 'box',
              model_url: object.modelUrl ?? null,
              playerControlled: object.playerControlled === true,
            }),
            objectOrder,
          ],
        );
        await insertBlocks({ connection, blocks: object.blocks, projectId, sceneId, objectId });
      }
    }
    await connection.execute(
      `INSERT INTO project_worlds (project_id, template_id, template_version, world_metadata)
       VALUES (?, ?, ?, ?)`,
      [projectId, template.id, template.version, JSON.stringify(worldMetadata(template, initialObjectIds))],
    );
  }, options?.pool ? { pool: options.pool } : undefined);

  return { projectId, revision: 0, templateId: template.id, templateVersion: template.version };
}
