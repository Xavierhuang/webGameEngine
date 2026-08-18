import { queryOne } from '@/lib/mysql/server';
import type { Actor } from '@/lib/auth/actor';
import {
  type AdminActor,
  isAdmin,
  isOwner,
  parseOwnerEmails,
} from '@/lib/auth/adminAccess';

/**
 * Server-side admin resolution, shared by the console page and every
 * `/api/admin/*` route.
 *
 * One helper on purpose: the previous admin surface hand-rolled its own
 * `requireAdmin` inside a single route file, so a second admin route would
 * have started by copying a security check — which is how one of them ends up
 * subtly weaker than the other.
 */

export function ownerEmails(): string[] {
  return parseOwnerEmails(process.env.ADMIN_EMAILS);
}

/** Load admin decision fields only from the already-verified user actor. */
export async function adminActor(actor: Actor): Promise<AdminActor | null> {
  if (actor.kind !== 'user') return null;
  return queryOne<AdminActor>(
    `SELECT p.id, p.role, u.email
       FROM profiles p
       JOIN users u ON u.id = p.user_id
      WHERE p.id = ? AND p.user_id = ? AND p.profile_kind = 'user'`,
    [actor.profileId, actor.userId]
  );
}

/** The actor if they may use the admin surface, else null. */
export async function requireAdmin(actor: Actor): Promise<AdminActor | null> {
  const candidate = await adminActor(actor);
  return isAdmin(candidate, ownerEmails()) ? candidate : null;
}

/** True when the signed-in account is an owner (env-listed). */
export async function currentIsOwner(actor: Actor): Promise<boolean> {
  return isOwner(await adminActor(actor), ownerEmails());
}
