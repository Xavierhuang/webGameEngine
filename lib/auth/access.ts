import { queryOne } from '@/lib/mysql/server';
import { resolveCurrentActor } from '@/lib/auth/actor';

/**
 * Central project authorization.
 *
 * Previously every route hand-rolled its ownership check, and the guest branch
 * was an empty `if` with a "we'll allow this for now" comment — which meant any
 * logged-out caller could read *and overwrite* any project by UUID. Guests
 * couldn't be identified at all, because `getOrCreateGuestUser` minted a fresh
 * throwaway profile on every call and never persisted which one belonged to the
 * caller.
 *
 * The compatibility facade now delegates identity to the unified actor
 * resolver. Authenticated users resolve to their profile and guests resolve
 * only through a verified opaque session; public profile ids are never proof.
 */

/** The profile id acting on this request, or null if we can't identify anyone. */
export async function getActorProfileId(): Promise<string | null> {
  const actor = await resolveCurrentActor();
  return actor.kind === 'anonymous' ? null : actor.profileId;
}

import { decideAccess, type ProjectRow, type ProjectAccess } from '@/lib/auth/projectAccess';

export type { ProjectRow, ProjectAccess };
export { decideAccess };

/** Resolve view/edit rights for a project against the current request's actor. */
export async function getProjectAccess(project: ProjectRow): Promise<ProjectAccess> {
  return decideAccess(project, await getActorProfileId());
}

/** Convenience: load a project by id and resolve access in one step. */
export async function getProjectAccessById(
  projectId: string
): Promise<{ project: (ProjectRow & { id: string }) | null; access: ProjectAccess }> {
  const project = await queryOne<ProjectRow & { id: string }>(
    'SELECT id, owner_id, visibility, moderation_status FROM projects WHERE id = ?',
    [projectId]
  );

  if (!project) {
    return { project: null, access: { canView: false, canEdit: false, isOwner: false } };
  }

  return { project, access: await getProjectAccess(project) };
}
