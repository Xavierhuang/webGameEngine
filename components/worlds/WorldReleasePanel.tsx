'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/** Mirrors `OwnerWorldRelease` from `lib/worlds/releaseAccess.ts`. */
export interface OwnerReleaseSummary {
  id: string;
  status: string;
  sourceRevision: number;
  submittedAt: string;
  publicSlug: string | null;
  checks: Array<{ name: string; status: string; reasonCode: string | null }>;
}

interface WorldReleasePanelProps {
  projectId: string;
  /** Authoritative project revision from the editor; a submission pins to it. */
  projectRevision: number;
  /** Injected in tests; production fetches on mount. */
  initialReleases?: OwnerReleaseSummary[];
}

/**
 * Creator-facing release controls for a World Builder project.
 *
 * Deliberately absent: moderator reason codes, reviewer identity, review notes,
 * and any consent or account field. The owner API does not return them, and
 * this panel derives all of its copy from the release status alone — a child
 * should learn what to do next, not read a policy code written for staff.
 */
export default function WorldReleasePanel({ projectId, projectRevision, initialReleases }: WorldReleasePanelProps) {
  const [releases, setReleases] = useState<OwnerReleaseSummary[] | null>(initialReleases ?? null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/world-releases`);
      if (!response.ok) {
        setReleases([]);
        return;
      }
      const body = await response.json();
      setReleases(Array.isArray(body.releases) ? body.releases : []);
    } catch {
      setReleases([]);
    }
  }, [projectId]);

  useEffect(() => {
    if (initialReleases !== undefined) return;
    // Load asynchronously and drop the result if the dialog closed first, so
    // this effect never writes state synchronously or after unmount.
    let cancelled = false;
    (async () => {
      let next: OwnerReleaseSummary[] = [];
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/world-releases`);
        if (response.ok) {
          const body = await response.json();
          if (Array.isArray(body.releases)) next = body.releases;
        }
      } catch {
        next = [];
      }
      if (!cancelled) setReleases(next);
    })();
    return () => { cancelled = true; };
  }, [initialReleases, projectId]);

  // The newest release is the only one whose state is actionable; earlier rows
  // are history and every terminal state is immutable by design.
  const current = useMemo(() => (releases && releases.length > 0 ? releases[0] : null), [releases]);
  const status = current?.status ?? 'draft';

  const failedChecks = useMemo(
    () => (current?.checks ?? []).filter((check) => check.status !== 'passed'),
    [current],
  );

  const post = useCallback(async (url: string, headers: Record<string, string> = {}) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: '{}',
      });
      if (response.status === 503) {
        setNotice('Sharing worlds is turned off right now. Your world is safe and still yours.');
      } else if (response.status === 409) {
        setNotice('Something changed while you were working. Refresh and try once more.');
      } else if (!response.ok) {
        setNotice('That didn’t work. Try again in a little bit.');
      }
      await refresh();
    } catch {
      setNotice('That didn’t work. Try again in a little bit.');
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  const submit = useCallback(() => post(
    `/api/projects/${encodeURIComponent(projectId)}/world-releases`,
    // One key per click: a double-click must not create a second candidate.
    { 'Idempotency-Key': `submit-${projectId}-${projectRevision}-${crypto.randomUUID()}` },
  ), [post, projectId, projectRevision]);

  const withdraw = useCallback(() => {
    if (!current) return;
    return post(`/api/projects/${encodeURIComponent(projectId)}/world-releases/${encodeURIComponent(current.id)}/withdraw`);
  }, [current, post, projectId]);

  const canSubmit = status === 'draft' || status === 'changes_requested' || status === 'rejected'
    || status === 'withdrawn' || status === 'taken_down' || status === 'superseded';

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-4 text-sm">
        <div className="font-semibold text-slate-900">{headline(status)}</div>
        <p className="mt-0.5 leading-relaxed text-slate-600">{explanation(status)}</p>
      </div>

      {status === 'changes_requested' && failedChecks.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {failedChecks.map((check) => (
            <li key={check.name}>{checkAdvice(check.reasonCode)}</li>
          ))}
        </ul>
      )}

      {status === 'published' && current?.publicSlug && (
        <a
          href={`/worlds/${current.publicSlug}`}
          className="inline-block rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
        >
          See your world
        </a>
      )}

      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Submit for review
          </button>
        )}
        {status === 'review_pending' && (
          <button
            type="button"
            onClick={withdraw}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Withdraw submission
          </button>
        )}
        {status === 'published' && (
          <button
            type="button"
            onClick={withdraw}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Withdraw from Explore
          </button>
        )}
      </div>

      {notice && <p className="text-sm leading-relaxed text-amber-800">{notice}</p>}
    </div>
  );
}

function headline(status: string): string {
  switch (status) {
    case 'submitted':
    case 'checking': return 'Checking your world';
    case 'review_pending': return 'Waiting for a grown-up to look';
    case 'published': return 'Your world is out there';
    case 'changes_requested': return 'A few things to fix';
    case 'rejected': return 'This one can’t go out';
    case 'withdrawn': return 'You took this one back';
    case 'taken_down': return 'This one was taken down';
    case 'superseded': return 'A newer version replaced this';
    default: return 'Private draft';
  }
}

function explanation(status: string): string {
  switch (status) {
    case 'submitted':
    case 'checking': return 'We’re making sure everything works. This only takes a moment.';
    case 'review_pending': return 'A reviewer will check your world before anyone else can play it.';
    case 'published': return 'Anyone can play your world now. You can take it back any time.';
    case 'changes_requested': return 'Fix the things below, then send it again.';
    case 'rejected': return 'You can keep building here, and you can always start something new.';
    case 'withdrawn': return 'Nobody else can play it right now. Send it again whenever you like.';
    case 'taken_down': return 'You can keep building here. Ask a grown-up if you have questions.';
    case 'superseded': return 'Your newest world is the one people can play.';
    default: return 'Only you can see this world. Send it for review when you’re ready to share it.';
  }
}

/**
 * Fixed automated check codes become child-readable advice. Any code without a
 * specific line falls back to neutral wording rather than leaking the raw code.
 */
function checkAdvice(reasonCode: string | null): string {
  switch (reasonCode) {
    case 'scene_missing': return 'Your world needs at least one scene.';
    case 'player_missing': return 'Add a character for players to control.';
    case 'player_controls_missing': return 'Give your character some blocks so it can move.';
    case 'budget_exceeded': return 'Your world is a bit too big. Try removing a few things.';
    case 'asset_size_unavailable': return 'One of your pictures or sounds needs to be uploaded again.';
    case 'asset_url_invalid':
    case 'asset_reference_invalid': return 'One of your pictures or sounds can’t be used yet.';
    case 'block_type_unsupported':
    case 'block_data_invalid': return 'One of your blocks can’t be shared yet. Try a different one.';
    case 'metadata_invalid':
    case 'metadata_moderation_failed': return 'Try a different title or description.';
    default: return 'Something needs another look before this can be shared.';
  }
}
