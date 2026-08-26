/**
 * Materializes a published world release into a new private project.
 *
 * This deliberately does not reuse `app/api/projects/[id]/remix/route.ts`. That
 * path deep-copies the source project's *live, editable* rows, which is correct
 * for ordinary remixing and wrong here: a public release is authority over one
 * frozen snapshot, and a visitor who remixes what they played must receive what
 * they played, not whatever the original creator has since edited it into.
 *
 * Everything below is reconstructed from `project_play_snapshots.snapshot_json`
 * and the release row. The only live rows read are the ones needed to confirm
 * the release is still public, and the only live row written outside the new
 * project is the source's remix counter.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'mysql2/promise';
import type { Actor } from '@/lib/auth/actor';
import { withTransaction, type TransactionConnection } from '@/lib/mysql/transaction';
import { hashProjectSnapshot, type ProjectSnapshot, type SnapshotLogicBlock } from '@/lib/projects/projectSnapshot';
import { ReleaseServiceError } from './releaseTypes';

export interface ReleaseRemixOptions {
  /** Test seam, mirroring `createReleaseService`; production uses the shared pool. */
  pool?: Pick<Pool, 'getConnection'>;
  uuid?: () => string;
}

export interface RemixWorldReleaseInput {
  actor: Actor;
  releaseId: string;
}

export interface RemixWorldReleaseResult {
  project: {
    id: string;
    title: string;
    visibility: 'private';
    remixedFrom: string;
    sourceReleaseId: string;
    templateId: string;
    templateVersion: number;
  };
}

interface PublicReleaseRow {
  id: string;
  project_id: string;
  project_play_snapshot_id: string;
  template_id: string;
  template_version: number | string;
  project_revision: number | string;
  snapshot_sha256: string;
}

interface SnapshotRow {
  snapshot_json: unknown;
  snapshot_sha256: string;
  revision: number | string;
}

interface AssetSizeRow {
  id: string;
  file_size: number | string | null;
}

const REMIX_TITLE_SUFFIX = ' (remix)';
const MAX_TITLE_LENGTH = 255;

function rows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
}

function parseSnapshot(value: unknown): ProjectSnapshot | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const candidate = parsed as ProjectSnapshot;
  if (!candidate.project || !Array.isArray(candidate.scenes) || !Array.isArray(candidate.assets)) return null;
  return candidate;
}

function remixTitle(sourceTitle: string): string {
  const base = typeof sourceTitle === 'string' ? sourceTitle : 'World';
  return `${base}${REMIX_TITLE_SUFFIX}`.slice(0, MAX_TITLE_LENGTH);
}

function jsonColumn(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? {});
}

/**
 * Remixing requires a profile to own the result. Guests have one, so they can
 * remix; a fully anonymous visitor cannot, and gets the same non-disclosing
 * error a missing release would produce at the route layer.
 */
function requireOwningProfile(actor: Actor): string {
  if (actor.kind === 'anonymous') throw new ReleaseServiceError('release_auth_forbidden', 403);
  return actor.profileId;
}

/**
 * Copies logic blocks while preserving `parent_block_id`. The legacy remix path
 * drops that column, which silently flattens nested blocks; a World Builder
 * snapshot's control-flow blocks depend on it, so the mapping is done in two
 * passes — mint every new id first, then rewrite the parent references.
 */
async function insertLogicBlocks(
  connection: TransactionConnection,
  blocks: SnapshotLogicBlock[],
  projectId: string,
  objectIdMap: Map<string, string>,
  sceneIdMap: Map<string, string>,
  makeUuid: () => string,
): Promise<void> {
  const blockIdMap = new Map<string, string>();
  for (const block of blocks) blockIdMap.set(block.id, makeUuid());

  for (const block of blocks) {
    const gameObjectId = block.game_object_id ? objectIdMap.get(block.game_object_id) ?? null : null;
    // A block whose owning object did not survive the copy has nothing to
    // attach to; dropping it is safer than pointing it at a foreign object.
    if (block.game_object_id && !gameObjectId) continue;
    await connection.execute(
      `INSERT INTO logic_blocks
         (id, game_object_id, project_id, scene_id, block_type, category, parent_block_id, order_index, block_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        blockIdMap.get(block.id)!,
        gameObjectId,
        projectId,
        block.scene_id ? sceneIdMap.get(block.scene_id) ?? null : null,
        block.block_type,
        block.category,
        block.parent_block_id ? blockIdMap.get(block.parent_block_id) ?? null : null,
        block.order_index,
        jsonColumn(block.block_data),
      ],
    );
  }
}

export function createReleaseRemixService(options: ReleaseRemixOptions = {}) {
  const makeUuid = options.uuid ?? randomUUID;

  async function remixWorldRelease(input: RemixWorldReleaseInput): Promise<RemixWorldReleaseResult> {
    const { actor, releaseId } = input;
    if (typeof releaseId !== 'string' || releaseId.length === 0 || releaseId.length > 64) {
      throw new ReleaseServiceError('invalid_release_input', 400);
  }
  const ownerProfileId = requireOwningProfile(actor);

  return withTransaction<RemixWorldReleaseResult>(async (connection) => {
    // Lock the release and re-read it under that lock: a takedown or withdrawal
    // committing mid-remix must not leave a copy of unreviewed content behind.
    const release = rows<PublicReleaseRow>(await connection.execute(
      `SELECT id, project_id, project_play_snapshot_id, template_id, template_version,
              project_revision, snapshot_sha256
         FROM world_releases
        WHERE id = ? AND status = 'published' AND current_public = TRUE
        FOR UPDATE`,
      [releaseId],
    ))[0];
    if (!release) throw new ReleaseServiceError('release_not_found', 404);

    const snapshotRow = rows<SnapshotRow>(await connection.execute(
      `SELECT snapshot_json, snapshot_sha256, revision
         FROM project_play_snapshots
        WHERE id = ? AND project_id = ?
        FOR UPDATE`,
      [release.project_play_snapshot_id, release.project_id],
    ))[0];
    if (!snapshotRow) throw new ReleaseServiceError('snapshot_unavailable', 422);
    if (snapshotRow.snapshot_sha256 !== release.snapshot_sha256
      || Number(snapshotRow.revision) !== Number(release.project_revision)) {
      throw new ReleaseServiceError('snapshot_integrity_failed', 422);
    }
    const snapshot = parseSnapshot(snapshotRow.snapshot_json);
    if (!snapshot) throw new ReleaseServiceError('snapshot_integrity_failed', 422);
    // Matching hash columns only prove two rows agree with each other. Recompute
    // from the stored bytes so snapshot content edited in the database after
    // approval cannot be handed to a remixer as reviewed content.
    // `releaseService.assertSnapshotIntegrity` and
    // `getPublicWorldReleaseSnapshot` apply the same rule.
    if (hashProjectSnapshot(snapshot) !== release.snapshot_sha256) {
      throw new ReleaseServiceError('snapshot_integrity_failed', 422);
    }

    const projectId = makeUuid();
    await connection.execute(
      `INSERT INTO projects
         (id, owner_id, remixed_from, source_release_id, title, description, genre, thumbnail_url,
          visibility, is_published, moderation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'private', FALSE, 'draft')`,
      [
        projectId,
        ownerProfileId,
        release.project_id,
        release.id,
        remixTitle(snapshot.project.title),
        snapshot.project.description,
        snapshot.project.genre,
        snapshot.project.thumbnail_url,
      ],
    );

    // World identity comes from the release row, not `project_worlds`, so a
    // later template migration on the source cannot retarget an old remix.
    await connection.execute(
      `INSERT INTO project_worlds (project_id, template_id, template_version, world_metadata)
       VALUES (?, ?, ?, JSON_OBJECT())`,
      [projectId, release.template_id, Number(release.template_version)],
    );

    const sceneIdMap = new Map<string, string>();
    const objectIdMap = new Map<string, string>();
    for (const scene of snapshot.scenes) {
      const sceneId = makeUuid();
      sceneIdMap.set(scene.id, sceneId);
      await connection.execute(
        `INSERT INTO scenes
           (id, project_id, name, order_index, background_color, background_image_url,
            lighting_preset, physics_enabled, gravity_y)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sceneId, projectId, scene.name, scene.order_index, scene.background_color,
          scene.background_image_url, scene.lighting_preset,
          scene.physics_enabled ? 1 : 0, scene.gravity_y,
        ],
      );

      for (const object of scene.objects) {
        const objectId = makeUuid();
        objectIdMap.set(object.id, objectId);
        await connection.execute(
          `INSERT INTO game_objects
             (id, scene_id, type, name, position_x, position_y, position_z, rotation,
              scale_x, scale_y, sprite_url, color, width, height,
              has_physics, is_static, mass, properties, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            objectId, sceneId, object.type, object.name,
            object.position_x, object.position_y, object.position_z, object.rotation,
            object.scale_x, object.scale_y, object.sprite_url, object.color,
            object.width, object.height,
            object.has_physics ? 1 : 0, object.is_static ? 1 : 0, object.mass,
            jsonColumn(object.properties), object.order_index,
          ],
        );
      }
    }

    const blocks = snapshot.scenes.flatMap((scene) => scene.objects.flatMap((object) => object.logic_blocks ?? []));
    await insertLogicBlocks(connection, blocks, projectId, objectIdMap, sceneIdMap, makeUuid);

    if (snapshot.assets.length > 0) {
      // `file_size` is durable file metadata rather than part of the editable
      // graph, and Task 3's budget check will not accept a size from anywhere
      // else. Carry it across from the source rows where they still exist; a
      // missing row leaves NULL, which fails closed as `asset_size_unavailable`
      // if this remix is ever submitted for release.
      const assetIds = [...new Set(snapshot.assets.map((asset) => asset.id))];
      const placeholders = assetIds.map(() => '?').join(',');
      const sourceSizes = new Map<string, number>();
      for (const row of rows<AssetSizeRow>(await connection.execute(
        `SELECT id, file_size FROM assets WHERE project_id = ? AND id IN (${placeholders})`,
        [release.project_id, ...assetIds],
      ))) {
        const size = typeof row.file_size === 'string' ? Number(row.file_size) : row.file_size;
        if (typeof size === 'number' && Number.isSafeInteger(size) && size >= 0) sourceSizes.set(row.id, size);
      }

      for (const asset of snapshot.assets) {
        await connection.execute(
          `INSERT INTO assets
             (id, project_id, owner_id, asset_type, name, file_url, file_size, mime_type, moderation_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
          [
            makeUuid(), projectId, ownerProfileId, asset.asset_type, asset.name,
            asset.file_url, sourceSizes.get(asset.id) ?? null, asset.mime_type,
          ],
        );
      }
    }

    // Counters advance only after the copy succeeded, inside the same
    // transaction, so a failed remix never inflates them.
    await connection.execute('UPDATE projects SET remix_count = remix_count + 1 WHERE id = ?', [release.project_id]);

    return {
      project: {
        id: projectId,
        title: remixTitle(snapshot.project.title),
        visibility: 'private',
        remixedFrom: release.project_id,
        sourceReleaseId: release.id,
        templateId: release.template_id,
        templateVersion: Number(release.template_version),
      },
    };
  }, options.pool ? { pool: options.pool } : undefined);
  }

  return { remixWorldRelease };
}

const defaultRemixService = createReleaseRemixService();
export const remixWorldRelease = defaultRemixService.remixWorldRelease;
