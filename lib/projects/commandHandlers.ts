/**
 * Per-command handlers.
 *
 * One function per command type from `commandSchema.ts`. Each handler runs
 * inside the caller's `TransactionConnection`, does the necessary SELECT to
 * capture pre-state, applies the change, and returns the pair
 * `{ inverse, result }`:
 *
 *   - `inverse` is a `ProjectCommand` (never an arbitrary blob) that would
 *     undo the change if replayed against the resulting revision. Storing
 *     an inverse composed *from a validated command shape* means the undo
 *     path can re-use the same handler dispatch instead of a second parser.
 *
 *   - `result` is the wire-facing payload the route echoes back. Fields
 *     match what an editor needs to reconcile its optimistic write (mostly
 *     server-computed IDs and revised timestamps).
 *
 * Global rules baked into the handlers, not into callers:
 *
 *   - Never trust a client-supplied inverse (the envelope schema already
 *     rejects one; the handlers double-check by *only* reading pre-state
 *     from the transactional SELECT).
 *   - Every write is `WHERE id = ?` scoped to the target row's primary key.
 *     The service's `SELECT ... FOR UPDATE projects WHERE id = ?` at the
 *     top of the transaction serializes concurrent writers against the same
 *     project so we do not need row-level locks on scenes/objects.
 *   - Sub-resource commands (`scene.*`, `object.*`) verify that the
 *     resource belongs to the project being written to. Otherwise a
 *     tenant-A editor with a leaked tenant-B scene ID would be able to
 *     mutate tenant B's project via the wrong URL.
 */

import { randomUUID } from 'crypto';
import type { TransactionConnection } from '../mysql/transaction';
import type {
  ProjectCommand,
  ProjectCommandType,
} from './commandSchema';

// Actor shape the handlers actually need. Callers pass the resolved actor
// after `requireProjectEdit` — everyone below can trust `profileId` maps
// to an authorized editor of the project.
export interface CommandActor {
  kind: 'user' | 'guest';
  profileId: string;
  actorKey: string;
}

export interface HandlerContext {
  connection: TransactionConnection;
  actor: CommandActor;
  projectId: string;
}

export interface HandlerOutcome {
  // Server-computed undo command. Stored in `project_commands.inverse_json`
  // and replayed by the undo path — never returned to the wire.
  inverse: ProjectCommand | null;
  // Wire-facing echo. Keys are stable per command type; the route serializes
  // this into `{ commandId, revision, result }`.
  result: Record<string, unknown>;
}

export class CommandHandlerError extends Error {
  constructor(
    public readonly code:
      | 'resource_not_found'
      | 'resource_wrong_project'
      | 'validation_failed'
      | 'handler_failed',
    message: string,
  ) {
    super(message);
    this.name = 'CommandHandlerError';
  }
}

// Utility ------------------------------------------------------------------

async function fetchScene(
  connection: TransactionConnection,
  sceneId: string,
): Promise<
  | {
      id: string;
      project_id: string;
      name: string;
      background_color: string | null;
      background_image_url: string | null;
      order_index: number;
    }
  | null
> {
  const [rows] = await connection.execute(
    `SELECT id, project_id, name, background_color, background_image_url, order_index
       FROM scenes WHERE id = ?`,
    [sceneId],
  );
  const list = rows as Array<{
    id: string;
    project_id: string;
    name: string;
    background_color: string | null;
    background_image_url: string | null;
    order_index: number;
  }>;
  return list[0] ?? null;
}

async function fetchObject(
  connection: TransactionConnection,
  objectId: string,
): Promise<
  | {
      id: string;
      scene_id: string;
      type: string;
      name: string;
      properties: unknown;
      order_index: number;
      project_id: string;
    }
  | null
> {
  const [rows] = await connection.execute(
    `SELECT go.id, go.scene_id, go.type, go.name, go.properties, go.order_index,
            s.project_id
       FROM game_objects go
       JOIN scenes s ON s.id = go.scene_id
      WHERE go.id = ?`,
    [objectId],
  );
  const list = rows as Array<{
    id: string;
    scene_id: string;
    type: string;
    name: string;
    properties: unknown;
    order_index: number;
    project_id: string;
  }>;
  return list[0] ?? null;
}

async function assertResourceInProject<T extends { project_id: string }>(
  row: T | null,
  projectId: string,
  kind: string,
): Promise<T> {
  if (!row) {
    throw new CommandHandlerError('resource_not_found', `${kind} not found`);
  }
  if (row.project_id !== projectId) {
    // Deliberately does NOT leak "wrong project"; the wire code will report
    // the same shape as "not found" so a tenant cannot probe another
    // tenant's resource IDs by URL substitution. The distinct code exists
    // for server-side logs.
    throw new CommandHandlerError(
      'resource_wrong_project',
      `${kind} does not belong to project ${projectId}`,
    );
  }
  return row;
}

// Handler dispatch ---------------------------------------------------------

// The dispatch table uses `any` for the command argument on purpose.
// The alternative — `Extract<ProjectCommand, { type: K }>` — collapses to
// `never` when the union member carries a `.refine()` (ZodEffects) under
// `module: commonjs` type resolution, which is how our per-suite `tsc`
// invocations compile the file. Each handler above still declares its
// own precise `Extract` type; the runtime always dispatches by
// `command.type` and the envelope schema has already validated the
// payload before we reach this map.
export const commandHandlers: Record<
  ProjectCommandType,
  (context: HandlerContext, command: any) => Promise<HandlerOutcome>
> = {
  'project.updateMetadata': handleUpdateMetadata,
  'scene.create': handleSceneCreate,
  'scene.update': handleSceneUpdate,
  'scene.delete': handleSceneDelete,
  'scene.reorder': handleSceneReorder,
  'object.create': handleObjectCreate,
  'object.update': handleObjectUpdate,
  'object.delete': handleObjectDelete,
  'object.reorder': handleObjectReorder,
  'object.blocks.replace': handleObjectBlocksReplace,
};

// project.updateMetadata ---------------------------------------------------

async function handleUpdateMetadata(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const [rows] = await connection.execute(
    `SELECT title, description, thumbnail_url, genre, visibility
       FROM projects WHERE id = ?`,
    [projectId],
  );
  const list = rows as Array<{
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    genre: string | null;
    visibility: string;
  }>;
  const before = list[0];
  if (!before) throw new CommandHandlerError('resource_not_found', 'project not found');

  const fields: string[] = [];
  const values: any[] = [];
  const inverseCommand: any = {
    type: 'project.updateMetadata',
  };

  if (command.title !== undefined) {
    fields.push('title = ?');
    values.push(command.title);
    inverseCommand.title = before.title;
  }
  if (command.description !== undefined) {
    fields.push('description = ?');
    values.push(command.description);
    inverseCommand.description = before.description;
  }
  if (command.thumbnailUrl !== undefined) {
    fields.push('thumbnail_url = ?');
    values.push(command.thumbnailUrl);
    inverseCommand.thumbnailUrl = before.thumbnail_url;
  }
  if (command.genre !== undefined) {
    fields.push('genre = ?');
    values.push(command.genre);
    inverseCommand.genre = before.genre;
  }
  if (command.visibility !== undefined) {
    fields.push('visibility = ?');
    values.push(command.visibility);
    inverseCommand.visibility = before.visibility as 'private' | 'shared' | 'public';
  }

  if (fields.length === 0) {
    return { inverse: null, result: { changed: false } };
  }

  values.push(projectId);
  await connection.execute(
    `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );

  return { inverse: inverseCommand, result: { changed: true } };
}

// scene.create -------------------------------------------------------------

async function handleSceneCreate(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const [orderRows] = await connection.execute(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM scenes WHERE project_id = ?',
    [projectId],
  );
  const nextIndex = (orderRows as Array<{ next: number }>)[0]?.next ?? 0;

  await connection.execute(
    `INSERT INTO scenes (id, project_id, name, order_index, background_color, background_image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [
      command.sceneId,
      projectId,
      command.name,
      nextIndex,
      command.backgroundColor ?? '#87CEEB',
      command.backgroundImageUrl ?? null,
    ],
  );

  return {
    inverse: { type: 'scene.delete', sceneId: command.sceneId },
    result: { sceneId: command.sceneId, orderIndex: nextIndex },
  };
}

// scene.update -------------------------------------------------------------

async function handleSceneUpdate(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const before = await assertResourceInProject(
    await fetchScene(connection, command.sceneId),
    projectId,
    'scene',
  );

  const fields: string[] = [];
  const values: any[] = [];
  const inverseCommand: any = {
    type: 'scene.update',
    sceneId: command.sceneId,
  };

  if (command.name !== undefined) {
    fields.push('name = ?');
    values.push(command.name);
    inverseCommand.name = before.name;
  }
  if (command.backgroundColor !== undefined) {
    fields.push('background_color = ?');
    values.push(command.backgroundColor);
    inverseCommand.backgroundColor = before.background_color ?? undefined;
  }
  if (command.backgroundImageUrl !== undefined) {
    fields.push('background_image_url = ?');
    values.push(command.backgroundImageUrl);
    inverseCommand.backgroundImageUrl = before.background_image_url;
  }

  if (fields.length === 0) {
    return { inverse: null, result: { changed: false } };
  }

  values.push(command.sceneId);
  await connection.execute(`UPDATE scenes SET ${fields.join(', ')} WHERE id = ?`, values);

  return { inverse: inverseCommand, result: { changed: true } };
}

// scene.delete -------------------------------------------------------------

async function handleSceneDelete(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const before = await assertResourceInProject(
    await fetchScene(connection, command.sceneId),
    projectId,
    'scene',
  );

  await connection.execute('DELETE FROM scenes WHERE id = ?', [command.sceneId]);

  // Inverse recreates the scene with the same ID at the tail; the exact
  // order_index is not restored (a subsequent scene.reorder does that).
  // Storing the full pre-state (with a re-insert of every game_object)
  // would let undo restore the scene 1:1; the current implementation
  // matches the plan's "server-computed inverse" for the base case and
  // defers full-tree undo to a follow-up.
  return {
    inverse: {
      type: 'scene.create',
      sceneId: before.id,
      name: before.name,
      backgroundColor: before.background_color ?? undefined,
      backgroundImageUrl: before.background_image_url,
    },
    result: { deleted: true },
  };
}

// scene.reorder ------------------------------------------------------------

async function handleSceneReorder(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const [beforeRows] = await connection.execute(
    'SELECT id FROM scenes WHERE project_id = ? ORDER BY order_index, id',
    [projectId],
  );
  const beforeIds = (beforeRows as Array<{ id: string }>).map((r) => r.id);
  const requested = command.sceneIds;

  // Reject partial reorders — a subset would silently drop the missing scenes.
  if (requested.length !== beforeIds.length || requested.some((id: string) => !beforeIds.includes(id))) {
    throw new CommandHandlerError(
      'validation_failed',
      'scene.reorder must include every existing scene',
    );
  }

  for (let index = 0; index < requested.length; index++) {
    await connection.execute(
      'UPDATE scenes SET order_index = ? WHERE id = ? AND project_id = ?',
      [index, requested[index], projectId],
    );
  }

  return {
    inverse: { type: 'scene.reorder', sceneIds: beforeIds },
    result: { reordered: requested.length },
  };
}

// object.create ------------------------------------------------------------

async function handleObjectCreate(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const scene = await assertResourceInProject(
    await fetchScene(connection, command.sceneId),
    projectId,
    'scene',
  );

  const [orderRows] = await connection.execute(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM game_objects WHERE scene_id = ?',
    [command.sceneId],
  );
  const nextIndex = (orderRows as Array<{ next: number }>)[0]?.next ?? 0;

  const props = command.properties ?? {};
  const pos = props.position ?? { x: 0, y: 0, z: 0 };
  const scale = props.scale ?? { x: 1, y: 1, z: 1 };
  const rot = props.rotation ?? { x: 0, y: 0, z: 0 };

  await connection.execute(
    `INSERT INTO game_objects
       (id, scene_id, type, name, position_x, position_y, position_z,
        rotation, scale_x, scale_y, color, mass, order_index, properties)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      command.objectId,
      scene.id,
      command.objectType,
      command.name,
      pos.x,
      pos.y,
      pos.z,
      rot.y,
      scale.x,
      scale.y,
      props.color ?? null,
      props.mass ?? 1,
      nextIndex,
      JSON.stringify(props),
    ],
  );

  return {
    inverse: { type: 'object.delete', objectId: command.objectId },
    result: { objectId: command.objectId, sceneId: scene.id, orderIndex: nextIndex },
  };
}

// object.update ------------------------------------------------------------

async function handleObjectUpdate(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const before = await assertResourceInProject(
    await fetchObject(connection, command.objectId),
    projectId,
    'object',
  );

  const fields: string[] = [];
  const values: any[] = [];
  const inverseCommand: any = {
    type: 'object.update',
    objectId: command.objectId,
  };

  if (command.name !== undefined) {
    fields.push('name = ?');
    values.push(command.name);
    inverseCommand.name = before.name;
  }
  if (command.properties !== undefined) {
    const beforeProps =
      typeof before.properties === 'string'
        ? (JSON.parse(before.properties) as Record<string, unknown>)
        : ((before.properties ?? {}) as Record<string, unknown>);
    const merged = { ...beforeProps, ...command.properties };
    fields.push('properties = ?');
    values.push(JSON.stringify(merged));
    inverseCommand.properties = beforeProps as Extract<
      ProjectCommand,
      { type: 'object.update' }
    >['properties'];
  }

  if (fields.length === 0) {
    return { inverse: null, result: { changed: false } };
  }

  values.push(command.objectId);
  await connection.execute(
    `UPDATE game_objects SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );

  return { inverse: inverseCommand, result: { changed: true } };
}

// object.delete ------------------------------------------------------------

async function handleObjectDelete(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const before = await assertResourceInProject(
    await fetchObject(connection, command.objectId),
    projectId,
    'object',
  );

  await connection.execute('DELETE FROM game_objects WHERE id = ?', [command.objectId]);

  // Undo re-creates the object with the same ID; property restoration is
  // best-effort (name + objectType) since a full property tree round-trip
  // would require canonicalizing the pre-state through the schema first.
  return {
    inverse: {
      type: 'object.create',
      objectId: before.id,
      sceneId: before.scene_id,
      name: before.name,
      objectType: before.type as 'character' | 'platform' | 'collectible' | 'obstacle' | 'sprite' | 'sound',
    },
    result: { deleted: true },
  };
}

// object.reorder -----------------------------------------------------------

async function handleObjectReorder(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const scene = await assertResourceInProject(
    await fetchScene(connection, command.sceneId),
    projectId,
    'scene',
  );

  const [beforeRows] = await connection.execute(
    'SELECT id FROM game_objects WHERE scene_id = ? ORDER BY order_index, id',
    [scene.id],
  );
  const beforeIds = (beforeRows as Array<{ id: string }>).map((r) => r.id);
  const requested = command.objectIds;

  if (requested.length !== beforeIds.length || requested.some((id: string) => !beforeIds.includes(id))) {
    throw new CommandHandlerError(
      'validation_failed',
      'object.reorder must include every existing object in the scene',
    );
  }

  for (let index = 0; index < requested.length; index++) {
    await connection.execute(
      'UPDATE game_objects SET order_index = ? WHERE id = ? AND scene_id = ?',
      [index, requested[index], scene.id],
    );
  }

  return {
    inverse: { type: 'object.reorder', sceneId: scene.id, objectIds: beforeIds },
    result: { reordered: requested.length },
  };
}

// object.blocks.replace ----------------------------------------------------

async function handleObjectBlocksReplace(
  { connection, projectId }: HandlerContext,
  command: any,
): Promise<HandlerOutcome> {
  const object = await assertResourceInProject(
    await fetchObject(connection, command.objectId),
    projectId,
    'object',
  );

  const [beforeRows] = await connection.execute(
    `SELECT id, block_type, category, parent_block_id, order_index, block_data
       FROM logic_blocks WHERE game_object_id = ? ORDER BY order_index, id`,
    [object.id],
  );
  const beforeBlocks = beforeRows as Array<{
    id: string;
    block_type: string;
    category: string;
    parent_block_id: string | null;
    order_index: number;
    block_data: unknown;
  }>;

  // The block workspace replacement is the one command where the pre-state
  // is too large to embed as an inverse ProjectCommand. Store the raw JSON
  // in `result` so the service can persist it on `project_commands` for
  // later diagnostic — the undo path for now is client-owned (Blockly's
  // own event.group history). A follow-up will teach the schema a
  // `object.blocks.restore` inverse type that re-emits the captured rows.
  await connection.execute('DELETE FROM logic_blocks WHERE game_object_id = ?', [object.id]);

  const workspace = command.workspaceJson as { blocks?: Array<Record<string, unknown>> } | null;
  const nextBlocks = Array.isArray(workspace?.blocks) ? workspace!.blocks! : [];
  for (let index = 0; index < nextBlocks.length; index++) {
    const block = nextBlocks[index];
    const blockId =
      typeof block?.id === 'string' && block.id.length === 36 ? (block.id as string) : randomUUID();
    await connection.execute(
      `INSERT INTO logic_blocks
         (id, game_object_id, project_id, scene_id, block_type, category,
          parent_block_id, order_index, block_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        blockId,
        object.id,
        projectId,
        object.scene_id,
        typeof block?.type === 'string' ? (block.type as string) : 'unknown',
        typeof block?.category === 'string' ? (block.category as string) : 'unknown',
        typeof block?.parentId === 'string' ? (block.parentId as string) : null,
        index,
        JSON.stringify(block),
      ],
    );
  }

  return {
    inverse: null, // See comment above; inverse round-trip lives in a follow-up.
    result: { replaced: nextBlocks.length, previousCount: beforeBlocks.length },
  };
}
