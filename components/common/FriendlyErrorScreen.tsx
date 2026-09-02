'use client';

import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { AppNav } from './AppNav';
import { PageBackdrop } from './PageBackdrop';
import { useTranslator } from './LocaleProvider';

/**
 * The page a child sees when something is missing or broken.
 *
 * There were no `error.tsx` / `not-found.tsx` files anywhere, so a shared link
 * to a private game landed on Next's stock English 404 — while a friendly
 * screen with a lock icon and a "Back to my games" button sat unused in the
 * play page. This is that screen, now reachable.
 */
export function FriendlyErrorScreen({
  icon,
  title,
  body,
  onRetry,
  backHref = '/projects',
  backLabelKey = 'common.backToGames',
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Shown as a "Try again" button when present (error boundaries pass `reset`). */
  onRetry?: () => void;
  backHref?: string;
  backLabelKey?: 'common.backToGames' | 'common.backHome';
}) {
  const t = useTranslator();
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav />
      <PageBackdrop />
      <div className="relative flex items-center justify-center px-4 py-24">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-xl">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            {icon}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-slate-600">{body}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 font-semibold text-white transition hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                {t('common.retry')}
              </button>
            )}
            <Link
              href={backHref}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold transition ${
                onRetry
                  ? 'border border-slate-200 text-slate-700 hover:border-slate-300'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              <ArrowLeft className="h-4 w-4" />
              {t(backLabelKey)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
