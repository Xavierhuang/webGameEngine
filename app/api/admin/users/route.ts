import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { requireAdmin, ownerEmails } from '@/lib/auth/admin';
import {
  canChangeRole,
  canDeleteAccount,
  isDisposableAccount,
  isOwner,
} from '@/lib/auth/adminAccess';

/**
 * Account administration for the site owner.
 *
 * The only admin surface that existed was the report queue, so there was no way
 * to see who had signed up, promote a moderator, or remove a spam account
 * without opening MySQL on the droplet.
 *
 * Every branch authorises through the pure rules in `lib/auth/adminAccess`
 * rather than re-deriving them here — those rules have their own tests, and a
 * check that only exists inside a route handler is a check nobody can exercise.
 */

interface UserRow {
  profile_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  role: string;
  created_at: Date;
  project_count: number;
  published_count: number;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    const admin = await requireAdmin(actor);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const users = await query<UserRow>(
      `SELECT p.id                AS profile_id,
              u.id                AS user_id,
              u.email             AS email,
              p.display_name      AS display_name,
              p.username          AS username,
              p.role              AS role,
              u.created_at        AS created_at,
              COUNT(pr.id)                                          AS project_count,
              SUM(CASE WHEN pr.visibility = 'public' THEN 1 ELSE 0 END) AS published_count
         FROM profiles p
         JOIN users u    ON u.id = p.user_id
    LEFT JOIN projects pr ON pr.owner_id = p.id
     GROUP BY p.id, u.id, u.email, p.display_name, p.username, p.role, u.created_at
     ORDER BY u.created_at DESC
        LIMIT 500`
    );

    const owners = ownerEmails();
    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        project_count: Number(u.project_count) || 0,
        published_count: Number(u.published_count) || 0,
        is_owner: isOwner({ email: u.email }, owners),
        is_disposable: isDisposableAccount(u.email),
        is_self: u.profile_id === admin.id,
      })),
      actor: { id: admin.id, email: admin.email, isOwner: isOwner(admin, owners) },
    });
  } catch (error: any) {
    console.error('Error listing users:', error);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

/** Change one account's role. */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    const admin = await requireAdmin(actor);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { profileId, role } = await request.json();
    if (!profileId || typeof role !== 'string') {
      return NextResponse.json({ error: 'profileId and role are required' }, { status: 400 });
    }

    const target = await queryOne<{ id: string; role: string; email: string }>(
      `SELECT p.id, p.role, u.email FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
      [profileId]
    );
    if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const decision = canChangeRole(admin, target, role, ownerEmails());
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: 403 });

    await query('UPDATE profiles SET role = ? WHERE id = ?', [role, profileId]);
    console.info(`[admin] ${admin.email} set role of ${target.email} to ${role}`);
    return NextResponse.json({ success: true, profileId, role });
  } catch (error: any) {
    console.error('Error changing role:', error);
    return NextResponse.json({ error: 'Failed to change role' }, { status: 500 });
  }
}

/**
 * Delete an account and everything it owns.
 *
 * Irreversible, so it refuses unless the caller passes the account's own email
 * back as `confirmEmail` — the same shape as a "type the name to confirm"
 * dialog, enforced on the server where it cannot be skipped.
 */
export async function DELETE(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    const admin = await requireAdmin(actor);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { profileId, confirmEmail } = await request.json();
    if (!profileId) return NextResponse.json({ error: 'profileId is required' }, { status: 400 });

    const target = await queryOne<{ id: string; role: string; email: string; user_id: string }>(
      `SELECT p.id, p.role, p.user_id, u.email
         FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
      [profileId]
    );
    if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const decision = canDeleteAccount(admin, target, ownerEmails());
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: 403 });

    if ((confirmEmail ?? '').trim().toLowerCase() !== target.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Type the account’s email address to confirm deletion.' },
        { status: 400 }
      );
    }

    // Projects first: the FK from projects to profiles is what would otherwise
    // decide the outcome, and relying on cascade behaviour for a destructive
    // admin action means the result depends on the schema rather than on this
    // code saying what it does.
    await query('DELETE FROM projects WHERE owner_id = ?', [target.id]);
    await query('DELETE FROM profiles WHERE id = ?', [target.id]);
    await query('DELETE FROM users WHERE id = ?', [target.user_id]);

    console.warn(`[admin] ${admin.email} deleted account ${target.email}`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting account:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
