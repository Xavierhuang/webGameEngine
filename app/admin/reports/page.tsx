import { query } from '@/lib/mysql/server';
import { resolveCurrentActor } from '@/lib/auth/actor';
import { requireAdmin } from '@/lib/auth/admin';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { ReportQueue } from '@/components/admin/ReportQueue';
import { ShieldAlert } from 'lucide-react';

/**
 * Admin moderation queue. Requires `profiles.role = 'admin'` — the role has
 * existed in the schema since 001 and was never checked anywhere.
 */
export default async function AdminReportsPage() {
  const actor = await resolveCurrentActor();
  const profile = await requireAdmin(actor);

  if (!profile) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-white">
        <AppNav />
        <PageBackdrop />
        <div className="relative mx-auto max-w-md px-6 pt-24 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="font-bold text-slate-900">Moderators only</p>
          <p className="mt-1 text-sm text-slate-600">
            This page is for the lingplay moderation team.
          </p>
        </div>
      </div>
    );
  }

  const reports = await query<any>(
    `SELECT r.id, r.reason, r.details, r.status, r.created_at,
            r.reported_project_id,
            p.title AS project_title, p.moderation_status,
            reporter.display_name AS reporter_name
     FROM reports r
     LEFT JOIN projects p ON p.id = r.reported_project_id
     LEFT JOIN profiles reporter ON reporter.id = r.reporter_profile_id
     WHERE r.status = 'open'
     ORDER BY r.created_at DESC
     LIMIT 100`
  );

  // Projects awaiting a first review — moderation_status defaults to 'pending'
  // and nothing used to move it, so these would sit invisible forever.
  const pending = await query<any>(
    `SELECT id, title, visibility, moderation_status, created_at
     FROM projects
     WHERE visibility = 'public' AND moderation_status = 'pending'
     ORDER BY created_at DESC
     LIMIT 50`
  );

  // Recent errors, grouped. Surfaced beside moderation because this is the one
  // page a maintainer already opens; a dashboard nobody visits reports nothing.
  const errors = await query<any>(
    `SELECT id, source, message, url, occurrences, last_seen
     FROM error_events
     WHERE resolved = FALSE
     ORDER BY last_seen DESC
     LIMIT 20`
  ).catch(() => []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav signedInAs={profile.email} />
      <PageBackdrop />
      <div className="relative mx-auto max-w-4xl px-6 pb-20 pt-10">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Moderation</h1>
        <p className="mt-1 text-slate-600">
          {reports.length} open report{reports.length === 1 ? '' : 's'} ·{' '}
          {pending.length} project{pending.length === 1 ? '' : 's'} awaiting review
        </p>

        <ReportQueue reports={reports} pending={pending} />

        <section className="mt-12">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Recent errors
          </h2>
          {errors.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              Nothing has failed recently.
            </p>
          ) : (
            <ul className="space-y-2">
              {errors.map((e: any) => (
                <li key={e.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-slate-800">{e.message}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {e.source} · {e.url || 'unknown page'} ·{' '}
                        {new Date(e.last_seen).toLocaleString()}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                      ×{e.occurrences}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
