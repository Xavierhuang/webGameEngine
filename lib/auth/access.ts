import { cookies } from 'next/headers';
import { queryOne } from '@/lib/mysql/server';
import { getAuthenticatedUser } from '@/lib/mysql/server';

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
 * The fix is a signed-in-or-guest "actor profile": authenticated users resolve
 * to their own profile, guests resolve via the `guest-id` cookie that
 * `getOrCreateGuestUser` now sets. Everything authorizes against that one id.
 */

export const GUEST_COOKIE = 'guest-profile-id';
/** Guest projects are unrecoverable if the cookie is lost, so keep it long. */
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The profile id acting on this request, or null if we can't identify anyone. */
export async function getActorProfileId(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  if (user) {
    const profile = await queryOne<{ id: string }>(
      'SELECT id FROM profiles WHERE user_id = ?',
      [user.id]
    );
    if (profile) return profile.id;
  }

  const cookieStore = await cookies();
  const guestId = cookieStore.get(GUEST_COOKIE)?.value;
  if (!guestId) return null;

  // Verify the cookie points at a profile that still exists — otherwise a
  // fabricated cookie value would authorize as an arbitrary profile id.
  const guestProfile = await queryOne<{ id: string }>(
    'SELECT id FROM profiles WHERE id = ?',
    [guestId]
  );
  return guestProfile?.id ?? null;
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
