'use client';

import { useCallback, useState } from 'react';

export interface QueuedWorldRelease {
  id: string;
  creatorLabel: string;
  submittedAt: string;
  templateId: string;
  templateVersion: number;
  sourceRevision: number;
  /** Present only once published; used for the frozen preview link. */
  publicSlug: string | null;
  status: string;
  checks: Array<{ name: string; status: string; reasonCode: string | null }>;
}

interface WorldReleaseQueueProps {
  releases: QueuedWorldRelease[];
}

const TAKEDOWN_REASONS = [
  { code: 'content_policy', label: 'Content policy' },
  { code: 'age_safety', label: 'Age safety' },
  { code: 'copyright', label: 'Copyright' },
  { code: 'administrative_action', label: 'Administrative action' },
] as const;

type PendingAction =
  | { kind: 'publish' | 'request_changes' | 'reject'; releaseId: string }
  | { kind: 'takedown'; releaseId: string; reasonCode: string };

/**
 * Moderator review queue for world releases.
 *
 * Every action is confirmed before it is sent, because publishing and taking
 * down are both irreversible from the moderator's side: a published release can
 * only be superseded or taken down, never un-published back into review.
 *
 * This renders no reporter identity, creator account field, or consent record —
 * only the release row's own safe columns and the fixed automated check codes.
 */
export default function WorldReleaseQueue({ releases }: WorldReleaseQueueProps) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (action: PendingAction) => {
    setBusyId(action.releaseId);
    setError(null);
    try {
      const url = action.kind === 'takedown'
        ? `/api/admin/world-releases/${encodeURIComponent(action.releaseId)}/takedown`
        : `/api/admin/world-releases/${encodeURIComponent(action.releaseId)}/decision`;
      const body = action.kind === 'takedown'
        ? { reasonCode: action.reasonCode }
        : { action: action.kind };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        setError(`Action failed (${response.status}${detail?.error ? `: ${detail.error}` : ''}).`);
        return;
      }
      window.location.reload();
    } catch {
      setError('Action failed. Check the connection and try again.');
    } finally {
      setBusyId(null);
      setPending(null);
    }
  }, []);

  if (releases.length === 0) {
    return <p className="text-sm text-slate-600">No world releases are waiting for review.</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {releases.map((release) => {
        const busy = busyId === release.id;
        const confirming = pending?.releaseId === release.id ? pending : null;
        return (
          <div key={release.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-900">{release.creatorLabel}</div>
                <div className="text-xs text-slate-500">
                  {release.templateId} v{release.templateVersion} · revision {release.sourceRevision} · {release.submittedAt}
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {release.status}
              </span>
            </div>

            {release.publicSlug && (
              <a
                href={`/worlds/${release.publicSlug}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-indigo-600 underline"
              >
                Open frozen preview
              </a>
            )}

            <ul className="mt-3 space-y-0.5 text-xs text-slate-600">
              {release.checks.map((check) => (
                <li key={check.name}>
                  {check.name}: {check.status}
                  {check.reasonCode ? ` (${check.reasonCode})` : ''}
                </li>
              ))}
            </ul>

            {confirming ? (
              <div className="mt-3 rounded-lg bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">
                  Confirm {confirming.kind === 'takedown' ? `take down (${confirming.reasonCode})` : confirming.kind.replace('_', ' ')}?
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send(confirming)}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Yes, do it
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {release.status === 'review_pending' && (
                  <>
                    <button type="button" disabled={busy} onClick={() => setPending({ kind: 'publish', releaseId: release.id })}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                      Publish
                    </button>
                    <button type="button" disabled={busy} onClick={() => setPending({ kind: 'request_changes', releaseId: release.id })}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-60">
                      Request changes
                    </button>
                    <button type="button" disabled={busy} onClick={() => setPending({ kind: 'reject', releaseId: release.id })}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-60">
                      Reject
                    </button>
                  </>
                )}

                {release.status === 'published' && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    Take down
                    <select
                      defaultValue=""
                      disabled={busy}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        setPending({ kind: 'takedown', releaseId: release.id, reasonCode: event.target.value });
                      }}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    >
                      <option value="">Choose a reason…</option>
                      {TAKEDOWN_REASONS.map((reason) => (
                        <option key={reason.code} value={reason.code}>{reason.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
