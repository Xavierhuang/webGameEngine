/**
 * Who counts as an administrator, and what they are allowed to do to accounts.
 *
 * Split out as pure decision functions so a bare `tsc` test can exercise every
 * branch. The rules below are the security boundary of the whole admin surface;
 * they should be readable without a database.
 *
 * ## Why an owner list at all
 *
 * `profiles.role = 'admin'` was the only way to be an admin, and the only two
 * accounts holding it were seeders — `examples@lingplay.local` and
 * `parity-demo@lingcode.internal`, neither of which is a person with a
 * password. So the site had a moderation queue nobody could open, and the only
 * way in was hand-editing MySQL on the droplet.
 *
 * `ADMIN_EMAILS` fixes the bootstrap: the owner is an owner because the
 * deployment says so, not because a row happens to be right. It also means the
 * owner cannot be locked out by a bad UPDATE.
 */

/** Parse the `ADMIN_EMAILS` env value: comma or whitespace separated. */
export function parseOwnerEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

export interface AdminActor {
  /** profiles.id */
  id: string;
  /** profiles.role */
  role: string;
  /** users.email */
  email: string;
}

/** True when this account may use the admin surface at all. */
export function isAdmin(actor: Pick<AdminActor, 'role' | 'email'> | null, ownerEmails: string[]): boolean {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  return ownerEmails.includes((actor.email ?? '').toLowerCase());
}

/** True when this account is an owner — an admin the app itself cannot demote. */
export function isOwner(actor: Pick<AdminActor, 'email'> | null, ownerEmails: string[]): boolean {
  if (!actor) return false;
  return ownerEmails.includes((actor.email ?? '').toLowerCase());
}

export const ASSIGNABLE_ROLES = ['child', 'parent', 'admin'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export interface Decision {
  ok: boolean;
  /** Shown to the admin when refused. Empty when allowed. */
  reason: string;
}

const ALLOW: Decision = { ok: true, reason: '' };
const deny = (reason: string): Decision => ({ ok: false, reason });

/**
 * May `actor` change `target`'s role to `role`?
 *
 * The self-check is the important one: an admin who demotes themselves by
 * accident locks the whole team out of the only page that can promote anyone
 * back, and the recovery is a DBA session on the droplet.
 */
export function canChangeRole(
  actor: AdminActor,
  target: Pick<AdminActor, 'id' | 'email' | 'role'>,
  role: string,
  ownerEmails: string[]
): Decision {
  if (!isAdmin(actor, ownerEmails)) return deny('Not an administrator.');
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) return deny(`Unknown role "${role}".`);
  if (actor.id === target.id) return deny('You cannot change your own role.');
  if (isOwner(target, ownerEmails) && role !== 'admin') {
    return deny('This account is an owner and cannot be demoted here.');
  }
  return ALLOW;
}

/**
 * May `actor` delete `target`'s account?
 *
 * Deleting a profile cascades to that person's projects, so this is the most
 * destructive thing the console can do. Owners and self are never deletable,
 * and an admin cannot delete another admin — removing that requires demoting
 * them first, which is a second deliberate step.
 */
export function canDeleteAccount(
  actor: AdminActor,
  target: Pick<AdminActor, 'id' | 'email' | 'role'>,
  ownerEmails: string[]
): Decision {
  if (!isAdmin(actor, ownerEmails)) return deny('Not an administrator.');
  if (actor.id === target.id) return deny('You cannot delete your own account.');
  if (isOwner(target, ownerEmails)) return deny('Owner accounts cannot be deleted here.');
  if (target.role === 'admin') return deny('Demote this administrator before deleting the account.');
  return ALLOW;
}

/**
 * Accounts created by the test suites, which sign up throwaway users against
 * production. They are identifiable by domain, and grouping them lets the
 * console offer a single tidy-up instead of twenty individual deletes.
 */
export function isDisposableAccount(email: string | null | undefined): boolean {
  const e = (email ?? '').toLowerCase();
  return e.endsWith('@example.com') || e.endsWith('@temp.local');
}
