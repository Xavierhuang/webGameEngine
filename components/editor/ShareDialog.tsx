'use client';

import { useState } from 'react';
import { Check, Copy, Globe, Lock, X } from 'lucide-react';
import { useTranslator } from '../common/LocaleProvider';

interface ShareDialogProps {
  projectId: string;
  initialVisibility: string;
  initialModerationStatus?: string;
  onClose: () => void;
  onVisibilityChange?: (visibility: string, moderationStatus: string) => void;
}

/**
 * Publish / unpublish a project.
 *
 * `projects.visibility` and `is_published` have existed since the initial
 * schema and were already in the PATCH allowlist, but no component ever set
 * them — so every project was permanently private and the gallery had nothing
 * to show. This dialog is the missing writer.
 */
export function ShareDialog({
  projectId,
  initialVisibility,
  initialModerationStatus = 'pending',
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

  const isPublic = visibility === 'public';
  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/play/${projectId}` : '';

  const setPublished = async (makePublic: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: makePublic ? 'public' : 'private',
          is_published: makePublic,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.reason || data?.error || 'Could not update sharing.');
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
      setError('Could not reach the server. Check your connection and try again.');
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
      setError('Could not copy the link — you can select and copy it manually.');
    }
  };

  const rejected = isPublic && moderationStatus === 'rejected';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{t('share.title')}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            {isPublic ? (
              <Globe className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            )}
            <div className="text-sm">
              <div className="font-semibold text-slate-900">
                {isPublic ? t('share.public') : t('share.private')}
              </div>
              <p className="mt-0.5 leading-relaxed text-slate-600">
                {isPublic
                  ? t('share.publicBody')
                  : t('share.privateBody')}
              </p>
            </div>
          </div>

          {rejected && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-800">
              This game was shared, but its title or description didn&apos;t pass our
              content check, so it won&apos;t appear in Explore. Edit the wording and
              share again.
            </p>
          )}

          {isPublic && !rejected && (
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
                  Create a free account
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
            {busy ? 'Working…' : isPublic ? t('share.makePrivate') : t('share.makePublic')}
          </button>

          {/* Export gives you a portable copy of the whole project — there was
              previously no way to get a project out of the product at all. */}
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
