/**
 * Canonical project snapshot loader and content hash.
 *
 * Two callers need "the exact bytes of the project right now":
 *
 *   - Play mode. The runtime loads a fixed revision instead of live rows so
 *     a concurrent editor edit does not mutate a running game session.
 *   - Deletion job. Before a project row is removed, the pipeline captures
 *     every blob checksum so storage GC has a receipt of what may be freed.
 *
 * Both consume the same canonical shape and both need the same hash so a
 * later integrity audit can detect drift without re-parsing. `loadProjectSnapshot`
 * therefore performs every SELECT inside the caller's `TransactionConnection`
 * so the resulting shape matches the exact revision that was locked before
 * the load began — mixing a load with an out-of-transaction handle would
 * race with a concurrent commit against the same project.
 *
 * `hashProjectSnapshot` produces a SHA-256 of a JSON serialization that
 * sorts object keys deterministically at every depth. That property is what
 * lets two independent processes agree that a given `(project_id, revision)`
 * pair has identical bytes on both sides — a stringify without key ordering
 * would let insertion order flip the hash.
 */

import { createHash } from 'crypto';
import type { TransactionConnection } from '../mysql/transaction';

export interface SnapshotSceneObject {
  id: string;
  scene_id: string;
  type: string;
  name: string;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation: number;
  scale_x: number;
  scale_y: number;
  sprite_url: string | null;
  color: string | null;
  width: number | null;
  height: number | null;
  has_physics: boolean;
  is_static: boolean;
  mass: number;
  properties: unknown;
  order_index: number;
}

export interface SnapshotScene {
  id: string;
  project_id: string;
  name: string;
  order_index: number;
  background_color: string | null;
  background_image_url: string | null;
  lighting_preset: string | null;
  physics_enabled: boolean;
  gravity_y: number;
  objects: SnapshotSceneObject[];
}

export interface SnapshotAsset {
  id: string;
  asset_type: string;
  name: string;
  file_url: string;
  mime_type: string | null;
  blob_checksum: string | null;
}

export interface ProjectSnapshot {
  project: {
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    visibility: string;
    genre: string | null;
    is_published: boolean;
    moderation_status: string;
    revision: number;
  };
  scenes: SnapshotScene[];
  assets: SnapshotAsset[];
}

interface ProjectRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  visibility: string;
  genre: string | null;
  is_published: number | boolean;
  moderation_status: string;
  revision: number | string;
}

interface SceneRow {
  id: string;
  project_id: string;
  name: string;
  order_index: number;
  background_color: string | null;
  background_image_url: string | null;
  lighting_preset: string | null;
  physics_enabled: number | boolean;
  gravity_y: number;
}

interface ObjectRow extends SnapshotSceneObject {
  has_physics: boolean;
  is_static: boolean;
}

interface AssetRow {
  id: string;
  asset_type: string;
  name: string;
  file_url: string;
  mime_type: string | null;
  blob_checksum: string | null;
}

export async function loadProjectSnapshot(
  connection: TransactionConnection,
  projectId: string,
): Promise<ProjectSnapshot | null> {
  const [projectRows] = await connection.execute(
    `SELECT id, owner_id, title, description, thumbnail_url, visibility, genre,
            is_published, moderation_status, revision
       FROM projects
      WHERE id = ?`,
    [projectId],
  );
  const projects = projectRows as ProjectRow[];
  const project = projects[0];
  if (!project) return null;

  const [sceneRows] = await connection.execute(
    `SELECT id, project_id, name, order_index, background_color, background_image_url,
            lighting_preset, physics_enabled, gravity_y
       FROM scenes
      WHERE project_id = ?
      ORDER BY order_index, id`,
    [projectId],
  );
  const scenes = sceneRows as SceneRow[];

  const sceneIds = scenes.map((s) => s.id);
  let objects: ObjectRow[] = [];
  if (sceneIds.length > 0) {
    const placeholders = sceneIds.map(() => '?').join(',');
    const [objectRows] = await connection.execute(
      `SELECT id, scene_id, type, name, position_x, position_y, position_z, rotation,
              scale_x, scale_y, sprite_url, color, width, height, has_physics, is_static,
              mass, properties, order_index
         FROM game_objects
        WHERE scene_id IN (${placeholders})
        ORDER BY scene_id, order_index, id`,
      sceneIds,
    );
    objects = objectRows as ObjectRow[];
  }

  const [assetRows] = await connection.execute(
    `SELECT id, asset_type, name, file_url, mime_type, blob_checksum
       FROM assets
      WHERE project_id = ?
      ORDER BY id`,
    [projectId],
  );
  const assets = assetRows as AssetRow[];

  return {
    project: {
      id: project.id,
      owner_id: project.owner_id,
      title: project.title,
      description: project.description,
      thumbnail_url: project.thumbnail_url,
      visibility: project.visibility,
      genre: project.genre,
      is_published: Boolean(project.is_published),
      moderation_status: project.moderation_status,
      revision: Number(project.revision),
    },
    scenes: scenes.map((scene) => ({
      id: scene.id,
      project_id: scene.project_id,
      name: scene.name,
      order_index: scene.order_index,
      background_color: scene.background_color,
      background_image_url: scene.background_image_url,
      lighting_preset: scene.lighting_preset,
      physics_enabled: Boolean(scene.physics_enabled),
      gravity_y: scene.gravity_y,
      objects: objects
        .filter((o) => o.scene_id === scene.id)
        .map((o) => ({
          id: o.id,
          scene_id: o.scene_id,
          type: o.type,
          name: o.name,
          position_x: o.position_x,
          position_y: o.position_y,
          position_z: o.position_z,
          rotation: o.rotation,
          scale_x: o.scale_x,
          scale_y: o.scale_y,
          sprite_url: o.sprite_url,
          color: o.color,
          width: o.width,
          height: o.height,
          has_physics: Boolean(o.has_physics),
          is_static: Boolean(o.is_static),
          mass: o.mass,
          properties: o.properties,
          order_index: o.order_index,
        })),
    })),
    assets: assets.map((a) => ({
      id: a.id,
      asset_type: a.asset_type,
      name: a.name,
      file_url: a.file_url,
      mime_type: a.mime_type,
      blob_checksum: a.blob_checksum,
    })),
  };
}

// Deterministic JSON stringify with recursive key sorting. `JSON.stringify`
// preserves insertion order, so a snapshot produced from two independent
// SELECTs (or on two different mysql2 driver versions with different result
// column ordering) could produce two different hashes for identical bytes.
// This function eliminates that by always emitting keys in Unicode order.
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`)
    .join(',')}}`;
}

export function hashProjectSnapshot(snapshot: ProjectSnapshot): string {
  return createHash('sha256').update(canonicalStringify(snapshot)).digest('hex');
}
