import { queryOne } from '../mysql/server';
import { resolveCurrentActor, type Actor } from './actor';
import {
  decideAccess,
  MISSING_PROJECT_ACCESS,
  type ProjectAccess,
  type ProjectRow,
} from './projectAccess';

export type { ProjectAccess, ProjectRow };
export { decideAccess };

export type AccessErrorCode =
  | 'project_not_found'
  | 'project_not_viewable'
  | 'project_edit_forbidden'
  | 'resource_type_invalid'
  | 'resource_not_found'
  | 'resource_edit_forbidden';

export class AccessError extends Error {
  constructor(
    public readonly code: AccessErrorCode,
    public readonly status: 403 | 404
  ) {
    super(code);
    this.name = 'AccessError';
  }
}

export type ResourceType = 'scene' | 'object' | 'logic-block' | 'asset';

export interface ProjectRecord extends ProjectRow {
  id: string;
}

export interface AuthorizedProject {
  project: ProjectRecord;
  access: ProjectAccess;
}

export interface AuthorizedResource extends AuthorizedProject {
  resource: { id: string; type: ResourceType };
}

interface ResourceProjectRow extends ProjectRecord {
  resource_id: string;
}

interface AccessDependencies {
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
  resolveCurrentActor(): Promise<Actor>;
}

const PROJECT_SELECT = `
  SELECT project.id, project.owner_id, project.visibility, project.moderation_status
    FROM projects project
   WHERE project.id = ?`;

const ACTOR_ROLE_SELECT = `
  SELECT actor_profile.role
    FROM profiles actor_profile
   WHERE actor_profile.id = ?
     AND actor_profile.user_id = ?
     AND actor_profile.profile_kind = 'user'`;

const RESOURCE_PROJECT_SELECT: Readonly<Record<ResourceType, string>> = Object.freeze({
  scene: `
    SELECT resource.id AS resource_id,
           project.id, project.owner_id, project.visibility, project.moderation_status
      FROM scenes resource
      JOIN projects project ON project.id = resource.project_id
     WHERE resource.id = ?`,
  object: `
    SELECT resource.id AS resource_id,
           project.id, project.owner_id, project.visibility, project.moderation_status
      FROM game_objects resource
      JOIN scenes resource_scene ON resource_scene.id = resource.scene_id
      JOIN projects project ON project.id = resource_scene.project_id
     WHERE resource.id = ?`,
  'logic-block': `
    SELECT resource.id AS resource_id,
           project.id, project.owner_id, project.visibility, project.moderation_status
      FROM logic_blocks resource
      LEFT JOIN game_objects resource_object ON resource_object.id = resource.game_object_id
      LEFT JOIN scenes object_scene ON object_scene.id = resource_object.scene_id
      LEFT JOIN scenes direct_scene ON direct_scene.id = resource.scene_id
      JOIN projects project
        ON project.id = COALESCE(object_scene.project_id, direct_scene.project_id, resource.project_id)
     WHERE resource.id = ?`,
  asset: `
    SELECT resource.id AS resource_id,
           project.id, project.owner_id, project.visibility, project.moderation_status
      FROM assets resource
      JOIN projects project ON project.id = resource.project_id
     WHERE resource.id = ?`,
});

const actorProfileId = (actor: Actor): string | null =>
  actor.kind === 'anonymous' ? null : actor.profileId;

function editDenialStatus(actor: Actor, access: ProjectAccess): 403 | 404 {
  return access.canView && actor.kind !== 'anonymous' ? 403 : 404;
}

export function createAccessService(dependencies: AccessDependencies) {
  async function loadProject(projectId: string): Promise<ProjectRecord | null> {
    return dependencies.queryOne<ProjectRecord>(PROJECT_SELECT, [projectId]);
  }

  async function resolveActorRole(actor: Actor): Promise<string | null> {
    if (actor.kind !== 'user') return null;
    const row = await dependencies.queryOne<{ role: string }>(ACTOR_ROLE_SELECT, [
      actor.profileId,
      actor.userId,
    ]);
    return row?.role ?? null;
  }

  async function getProjectAccess(actor: Actor, projectId: string): Promise<ProjectAccess>;
  /** @deprecated Task 4 removes this row overload; it still resolves a secure actor. */
  async function getProjectAccess(project: ProjectRow): Promise<ProjectAccess>;
  async function getProjectAccess(
    actorOrProject: Actor | ProjectRow,
    projectId?: string
  ): Promise<ProjectAccess> {
    if (projectId === undefined) {
      const actor = await dependencies.resolveCurrentActor();
      return decideAccess(actorOrProject as ProjectRow, actor, await resolveActorRole(actor));
    }
    const actor = actorOrProject as Actor;
    const [project, actorRole] = await Promise.all([
      loadProject(projectId),
      resolveActorRole(actor),
    ]);
    return project ? decideAccess(project, actor, actorRole) : MISSING_PROJECT_ACCESS;
  }

  async function requireProjectView(actor: Actor, projectId: string): Promise<AuthorizedProject> {
    const [project, actorRole] = await Promise.all([
      loadProject(projectId),
      resolveActorRole(actor),
    ]);
    if (!project) throw new AccessError('project_not_found', 404);
    const access = decideAccess(project, actor, actorRole);
    if (!access.canView) throw new AccessError('project_not_viewable', 404);
    return { project, access };
  }

  async function requireProjectEdit(actor: Actor, projectId: string): Promise<AuthorizedProject> {
    const [project, actorRole] = await Promise.all([
      loadProject(projectId),
      resolveActorRole(actor),
    ]);
    if (!project) throw new AccessError('project_not_found', 404);
    const access = decideAccess(project, actor, actorRole);
    if (!access.canEdit) {
      throw new AccessError('project_edit_forbidden', editDenialStatus(actor, access));
    }
    return { project, access };
  }

  async function requireResourceEdit(
    actor: Actor,
    resourceType: ResourceType,
    resourceId: string
  ): Promise<AuthorizedResource> {
    if (!Object.prototype.hasOwnProperty.call(RESOURCE_PROJECT_SELECT, resourceType)) {
      throw new AccessError('resource_type_invalid', 404);
    }
    const sql = RESOURCE_PROJECT_SELECT[resourceType];

    const [row, actorRole] = await Promise.all([
      dependencies.queryOne<ResourceProjectRow>(sql, [resourceId]),
      resolveActorRole(actor),
    ]);
    if (!row) throw new AccessError('resource_not_found', 404);
    const access = decideAccess(row, actor, actorRole);
    if (!access.canEdit) {
      throw new AccessError('resource_edit_forbidden', editDenialStatus(actor, access));
    }
    return {
      resource: { id: row.resource_id, type: resourceType },
      project: row,
      access,
    };
  }

  return { getProjectAccess, requireProjectView, requireProjectEdit, requireResourceEdit };
}

const defaultAccessService = createAccessService({ queryOne, resolveCurrentActor });

export async function getProjectAccess(actor: Actor, projectId: string): Promise<ProjectAccess>;
/** @deprecated Task 4 removes this row overload; it still resolves a secure actor. */
export async function getProjectAccess(project: ProjectRow): Promise<ProjectAccess>;
export async function getProjectAccess(
  actorOrProject: Actor | ProjectRow,
  projectId?: string
): Promise<ProjectAccess> {
  if (projectId === undefined) {
    return defaultAccessService.getProjectAccess(actorOrProject as ProjectRow);
  }
  return defaultAccessService.getProjectAccess(actorOrProject as Actor, projectId);
}

export const requireProjectView = defaultAccessService.requireProjectView;
export const requireProjectEdit = defaultAccessService.requireProjectEdit;
export const requireResourceEdit = defaultAccessService.requireResourceEdit;

/** @deprecated Task 4 removes profile-id call sites in favor of Actor. */
export async function getActorProfileId(): Promise<string | null> {
  return actorProfileId(await resolveCurrentActor());
}
