import { query } from '@/lib/mysql/server';
import { resolveCurrentActor } from '@/lib/auth/actor';
import { requireAdmin } from '@/lib/auth/admin';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { ReportQueue } from '@/components/admin/ReportQueue';
import WorldReleaseQueue, { type QueuedWorldRelease } from '@/components/admin/WorldReleaseQueue';

interface WorldReleaseRow {
  id: string;
  creator_label: string;
  submitted_at: Date | string;
  template_id: string;
  template_version: number | string;
  project_revision: number | string;
  public_slug: string | null;
  status: string;
}

interface WorldReleaseCheckRow {
  world_release_id: string;
  check_type: string;
  status: string;
  reason_code: string | null;
}
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

  // Projects awaiting review under migration 008's canonical state machine.
  const pending = await query<any>(
    `SELECT id, title, visibility, moderation_status, created_at
     FROM projects
     WHERE visibility = 'public' AND moderation_status = 'moderation_pending'
     ORDER BY created_at DESC
     LIMIT 50`
  );

  // World releases awaiting a decision, plus the ones currently public so a
  // moderator can take one down from the same page. Only the release row's own
  // safe columns are selected — no creator account, consent record, or reviewer
  // identity crosses into the queue.
  const worldReleases = await query<WorldReleaseRow>(
    `SELECT wr.id, wr.creator_label, wr.submitted_at, wr.template_id, wr.template_version,
            wr.project_revision, wr.public_slug, wr.status
     FROM world_releases wr
     WHERE wr.status = 'review_pending'
        OR (wr.status = 'published' AND wr.current_public = TRUE)
     ORDER BY FIELD(wr.status, 'review_pending', 'published'), wr.submitted_at ASC
     LIMIT 50`
  ).catch(() => []);

  const releaseChecks: WorldReleaseCheckRow[] = worldReleases.length === 0 ? [] : await query<WorldReleaseCheckRow>(
    `SELECT world_release_id, check_type, status, reason_code
     FROM world_release_checks
     WHERE world_release_id IN (${worldReleases.map(() => '?').join(',')})
     ORDER BY created_at ASC, id ASC`,
    worldReleases.map((release) => release.id),
  ).catch(() => []);

  const queuedReleases: QueuedWorldRelease[] = worldReleases.map((release) => ({
    id: release.id,
    creatorLabel: release.creator_label,
    submittedAt: new Date(release.submitted_at).toISOString(),
    templateId: release.template_id,
    templateVersion: Number(release.template_version),
    sourceRevision: Number(release.project_revision),
    publicSlug: release.public_slug,
    status: release.status,
    checks: releaseChecks
      .filter((check) => check.world_release_id === release.id)
      .map((check) => ({ name: check.check_type, status: check.status, reasonCode: check.reason_code })),
  }));

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
            World releases
          </h2>
          <WorldReleaseQueue releases={queuedReleases} />
        </section>

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
