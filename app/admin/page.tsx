import Link from 'next/link';
import { query } from '@/lib/mysql/server';
import { resolveCurrentActor } from '@/lib/auth/actor';
import { requireAdmin, ownerEmails } from '@/lib/auth/admin';
import { isOwner, isDisposableAccount } from '@/lib/auth/adminAccess';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { UserTable, type AdminUser } from '@/components/admin/UserTable';
import { ShieldAlert, Users, Gamepad2, Flag, ShieldCheck } from 'lucide-react';

/**
 * The owner's console.
 *
 * Before this, `/admin/reports` was the entire admin surface: a queue of
 * reported projects and nothing else. There was no way to see who had signed
 * up, promote a moderator, or remove a spam account without an SSH session and
 * a hand-written UPDATE — and the only two accounts holding `role = 'admin'`
 * were seeders with no password, so nobody could open even that one page.
 *
 * Server component: the account list never reaches a browser that has not
 * already passed the admin check.
 */

export const dynamic = 'force-dynamic';

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center gap-2 text-slate-400">{icon}</div>
      <div className="text-2xl font-black text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export default async function AdminPage() {
  const actor = await resolveCurrentActor();
  const admin = await requireAdmin(actor);

  if (!admin) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-white">
        <AppNav />
        <PageBackdrop />
        <div className="relative mx-auto max-w-md px-6 pt-24 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="font-bold text-slate-900">Owners and moderators only</p>
          <p className="mt-1 text-sm text-slate-600">
            {actor.kind !== 'anonymous'
              ? 'This account is not an administrator.'
              : 'Sign in with an administrator account to continue.'}
          </p>
          {/*
            Being explicit about the bootstrap is deliberate: the failure mode
            this page exists to fix was an admin surface nobody could reach,
            with no hint anywhere about how to get in.
          */}
          <p className="mt-4 text-xs text-slate-400">
            Access comes from <code>profiles.role = &apos;admin&apos;</code> or the{' '}
            <code>ADMIN_EMAILS</code> environment variable.
          </p>
        </div>
      </div>
    );
  }

  const owners = ownerEmails();

  const rows = await query<any>(
    `SELECT p.id AS profile_id, u.id AS user_id, u.email, p.display_name, p.username,
            p.role, u.created_at,
            COUNT(pr.id) AS project_count,
            SUM(CASE WHEN pr.visibility = 'public' AND pr.moderation_status = 'published'
                     THEN 1 ELSE 0 END) AS published_count
       FROM profiles p
       JOIN users u ON u.id = p.user_id
  LEFT JOIN projects pr ON pr.owner_id = p.id
   GROUP BY p.id, u.id, u.email, p.display_name, p.username, p.role, u.created_at
   ORDER BY u.created_at DESC
      LIMIT 500`
  );

  const users: AdminUser[] = rows.map((u: any) => ({
    profile_id: u.profile_id,
    email: u.email,
    display_name: u.display_name,
    username: u.username,
    role: u.role,
    created_at: new Date(u.created_at).toISOString(),
    project_count: Number(u.project_count) || 0,
    published_count: Number(u.published_count) || 0,
    is_owner: isOwner({ email: u.email }, owners),
    is_disposable: isDisposableAccount(u.email),
    is_self: u.profile_id === admin.id,
  }));

  const [projectStats] = await query<any>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN visibility = 'public' AND moderation_status = 'published'
                     THEN 1 ELSE 0 END) AS public_count
       FROM projects`
  );
  const [openReports] = await query<any>(
    `SELECT COUNT(*) AS open_count FROM reports WHERE status = 'open'`
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav signedInAs={admin.email} />
      <PageBackdrop />
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Owner console</h1>
            <p className="mt-1 text-sm text-slate-600">
              Signed in as {admin.email}
              {isOwner(admin, owners) && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                  <ShieldCheck className="h-3 w-3" /> OWNER
                </span>
              )}
            </p>
          </div>
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-300"
          >
            <Flag className="h-4 w-4" />
            Moderation queue
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<Users className="h-4 w-4" />} value={users.length} label="accounts" />
          <Stat
            icon={<Gamepad2 className="h-4 w-4" />}
            value={Number(projectStats?.total ?? 0)}
            label="projects"
          />
          <Stat
            icon={<Gamepad2 className="h-4 w-4" />}
            value={Number(projectStats?.public_count ?? 0)}
            label="published games"
          />
          <Stat
            icon={<Flag className="h-4 w-4" />}
            value={Number(openReports?.open_count ?? 0)}
            label="open reports"
          />
        </div>

        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">Accounts</h2>
        <UserTable initialUsers={users} />
      </main>
    </div>
  );
}
