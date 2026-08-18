import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { resolveCurrentActor } from './actor';
import { GUEST_COOKIE, issueGuestSession } from './guestSession';
import { guestSessionStore, query } from '../mysql/server';

/**
 * Create a guest profile without a users row. Authority comes only from a
 * separate opaque guest session.
 */
export async function createGuestProfile(): Promise<string> {
  const profileId = randomUUID();
  const suffix = profileId.replaceAll('-', '').slice(0, 12);
  await query(
    `INSERT INTO profiles
       (id, user_id, profile_kind, role, username, display_name, parental_approval)
     VALUES (?, NULL, 'guest', 'child', ?, 'Guest', false)`,
    [profileId, `Guest_${suffix}`]
  );
  return profileId;
}

/** Resolve an existing actor or mint a secure profile and opaque session. */
export async function getOrCreateGuestUser(): Promise<{
  userId: string | null;
  profileId: string;
}> {
  const actor = await resolveCurrentActor();
  if (actor.kind === 'user') {
    return { userId: actor.userId, profileId: actor.profileId };
  }
  if (actor.kind === 'guest') {
    return { userId: null, profileId: actor.profileId };
  }

  const profileId = await createGuestProfile();
  const issued = await issueGuestSession(guestSessionStore, profileId);
  const cookieStore = await cookies();
  const { name, ...options } = GUEST_COOKIE;
  cookieStore.set(name, issued.token, options);
  return { userId: null, profileId };
}
