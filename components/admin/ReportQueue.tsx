'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Trash2, ExternalLink } from 'lucide-react';

interface ReportQueueProps {
  reports: any[];
  pending: any[];
}

export function ReportQueue({ reports, pending }: ReportQueueProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (reportId: string, action: 'dismiss' | 'remove') => {
    setBusyId(reportId);
    try {
      const response = await fetch('/api/admin/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action }),
      });
      if (response.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-8 space-y-10">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Open reports
        </h2>
        {reports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            Nothing reported right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {report.project_title ?? 'Deleted project'}{' '}
                      <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-800">
                        {report.reason}
                      </span>
                    </p>
                    {report.details && (
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{report.details}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      Reported by {report.reporter_name ?? 'a guest'} ·{' '}
                      {new Date(report.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    {report.world_release_slug && (
                      <a
                        href={`/worlds/${report.world_release_slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-indigo-600 underline"
                      >
                        Open the reported release
                      </a>
                    )}
                    {report.reported_project_id && (
                      <Link
                        href={`/projects/${report.reported_project_id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </Link>
                    )}
                    <button
                      onClick={() => act(report.id, 'dismiss')}
                      disabled={busyId === report.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      It&apos;s fine
                    </button>
                    <button
                      onClick={() => act(report.id, 'remove')}
                      disabled={busyId === report.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Take down
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Awaiting first review
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            Nothing waiting. Newly shared projects appear here after entering
            the moderation queue.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                  {project.title}
                </span>
                <Link
                  href={`/projects/${project.id}`}
                  target="_blank"
                  className="shrink-0 text-xs font-semibold text-slate-600 underline"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
