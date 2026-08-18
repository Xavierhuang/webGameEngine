/** Pure project authorization policy; database and request wiring live in access.ts. */

export type AccessActor =
  | { kind: 'user'; userId: string; profileId: string }
  | { kind: 'guest'; sessionId: string; profileId: string }
  | { kind: 'anonymous' };

export interface ProjectRow {
  id?: string;
  owner_id: string;
  visibility?: string | null;
  moderation_status?: string | null;
}

export type ProjectAccessReason =
  | 'owner'
  | 'moderator'
  | 'published'
  | 'private'
  | 'draft'
  | 'moderation_pending'
  | 'rejected'
  | 'not_published'
  | 'project_not_found';

export interface ProjectAccess {
  canView: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canRemix: boolean;
  isOwner: boolean;
  reason: ProjectAccessReason;
}

export const MISSING_PROJECT_ACCESS: ProjectAccess = Object.freeze({
  canView: false,
  canEdit: false,
  canPublish: false,
  canRemix: false,
  isOwner: false,
  reason: 'project_not_found',
});

function hiddenReason(project: ProjectRow): ProjectAccessReason {
  if (project.visibility !== 'public') return 'private';
  if (project.moderation_status === 'draft') return 'draft';
  if (project.moderation_status === 'moderation_pending') return 'moderation_pending';
  if (project.moderation_status === 'rejected') return 'rejected';
  return 'not_published';
}

/** Only an immutable, published public state is stranger-readable. */
export function decideAccess(
  project: ProjectRow,
  actor: AccessActor,
  actorRole: string | null = null
): ProjectAccess {
  const profileId = actor.kind === 'anonymous' ? null : actor.profileId;
  const isOwner = profileId !== null && project.owner_id === profileId;
  if (isOwner) {
    return {
      canView: true,
      canEdit: true,
      canPublish: true,
      canRemix: true,
      isOwner: true,
      reason: 'owner',
    };
  }

  const isModerator =
    actor.kind === 'user' &&
    (actorRole === 'admin' || actorRole === 'moderator');
  if (isModerator) {
    return {
      canView: true,
      canEdit: false,
      canPublish: true,
      canRemix: false,
      isOwner: false,
      reason: 'moderator',
    };
  }

  const published =
    project.visibility === 'public' && project.moderation_status === 'published';
  if (published) {
    return {
      canView: true,
      canEdit: false,
      canPublish: false,
      canRemix: actor.kind !== 'anonymous',
      isOwner: false,
      reason: 'published',
    };
  }

  return {
    canView: false,
    canEdit: false,
    canPublish: false,
    canRemix: false,
    isOwner: false,
    reason: hiddenReason(project),
  };
}
