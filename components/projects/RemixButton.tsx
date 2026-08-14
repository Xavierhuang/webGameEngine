'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitFork } from 'lucide-react';
import { useTranslator } from '../common/LocaleProvider';

/**
 * Remix a project — deep-copies it under your ownership and drops you into the
 * editor on the copy. Scratch's core social loop.
 */
export function RemixButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const t = useTranslator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remix = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/remix`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.project?.id) {
        setError(data?.error || 'Could not remix this game.');
        return;
      }
      router.push(`/editor/${data.project.id}`);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col">
      <button
        onClick={remix}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-300 disabled:opacity-60"
        title="Make your own copy of this game"
      >
        <GitFork className="h-4 w-4" />
        {busy ? t('project.remixing') : t('project.remix')}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </div>
  );
}
