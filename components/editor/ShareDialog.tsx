'use client';

import { useState } from 'react';
import { Check, Clock, Copy, Globe, Lock, X } from 'lucide-react';
import { useTranslator } from '../common/LocaleProvider';
import WorldReleasePanel from '../worlds/WorldReleasePanel';

interface ShareDialogProps {
  projectId: string;
  initialVisibility: string;
  initialModerationStatus?: string;
  isWorldBuilder?: boolean;
  /** Authoritative editor revision; a World Builder submission pins to it. */
  projectRevision?: number;
  onClose: () => void;
  onVisibilityChange?: (visibility: string, moderationStatus: string) => void;
}

/**
 * Publication controls for ordinary projects, or a truthful private-draft
 * status for Phase 1 World Builder projects.
 */
export function ShareDialog({
  projectId,
  initialVisibility,
  initialModerationStatus = 'pending',
  isWorldBuilder = false,
  projectRevision = 0,
  onClose,
  onVisibilityChange,
}: ShareDialogProps) {
  const t = useTranslator();
  const [visibility, setVisibility] = useState(initialVisibility);
  const [moderationStatus, setModerationStatus] = useState(initialModerationStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [needsAccount, setNeedsAccount] = useState(false);

  // A template world is private by construction. Treat the server-provided
  // identity as authoritative here so stale or forged client metadata cannot
  // make a release link/control appear in the editor.
  const isPrivateDraft = isWorldBuilder;
  const isPublic = !isPrivateDraft && visibility === 'public';
  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/play/${projectId}` : '';

  const setPublished = async (makePublic: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Only visibility is settable here. Sending `is_published` made the
        // route answer 501 `publication_moved`, and that literal string was
        // what a child read after clicking Share. Publication itself is a
        // reviewed step that a moderator completes.
        body: JSON.stringify({
          visibility: makePublic ? 'public' : 'private',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // `reason` is a sentence written for the child; `error` is a code.
        setError(data?.reason || t('editor.share.updateFailed'));
        // Guests must register before publishing; point them at signup rather
        // than leaving a dead-end error.
        setNeedsAccount(data?.error === 'Account needed');
        return;
      }
      setNeedsAccount(false);

      const next = data?.project?.visibility ?? (makePublic ? 'public' : 'private');
      const nextModeration = data?.project?.moderation_status ?? moderationStatus;
      setVisibility(next);
      setModerationStatus(nextModeration);
      onVisibilityChange?.(next, nextModeration);
    } catch {
      setError(t('editor.share.serverUnreachable'));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('editor.share.copyFailed'));
    }
  };

  const rejected = isPublic && moderationStatus === 'rejected';
  // Public but not yet reviewed: the link would 404 for anyone else, so say
  // so instead of handing out a link that does not work.
  const published = isPublic && moderationStatus === 'published';
  const pendingReview = isPublic && !rejected && !published;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {isPrivateDraft ? t('editor.share.privateDraft') : t('share.title')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('editor.common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/*
            World Builder projects release through review rather than the
            legacy visibility toggle. Everything below this branch is the
            original ordinary-project flow and is deliberately unchanged.
          */}
          {isPrivateDraft ? (
            <WorldReleasePanel projectId={projectId} projectRevision={projectRevision} />
          ) : (
          <>
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            {published ? (
              <Globe className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : pendingReview ? (
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            ) : (
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            )}
            <div className="text-sm">
              <div className="font-semibold text-slate-900">
                {published ? t('share.public') : pendingReview ? t('editor.share.pendingReview') : t('share.private')}
              </div>
              <p className="mt-0.5 leading-relaxed text-slate-600">
                {published ? t('share.publicBody') : pendingReview ? t('editor.share.pendingReviewBody') : t('share.privateBody')}
              </p>
            </div>
          </div>

          {rejected && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-800">
              {t('editor.share.flaggedContent')}
            </p>
          )}

          {published && (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              />
              <button
                onClick={copyLink}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? t('share.copied') : t('share.copy')}
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
              <p>{error}</p>
              {needsAccount && (
                <a
                  href="/auth/signup"
                  className="mt-2 inline-block font-semibold underline"
                >
                  {t('editor.share.createAccount')}
                </a>
              )}
            </div>
          )}

          <button
              onClick={() => setPublished(!isPublic)}
              disabled={busy}
              className={`w-full rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                isPublic
                  ? 'border border-slate-200 text-slate-700 hover:border-slate-300'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {busy ? t('editor.share.working') : isPublic ? t('share.makePrivate') : t('share.makePublic')}
            </button>
          </>
          )}

          {/* Export gives you a portable copy of the whole project — there was
              previously no way to get a project out of the product at all, and
              it stays available to World Builder and ordinary projects alike. */}
          <a
            href={`/api/projects/${projectId}/export`}
            className="block w-full rounded-full border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            {t('share.download')}
          </a>
        </div>
      </div>
    </div>
  );
}
