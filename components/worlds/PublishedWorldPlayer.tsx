'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import GamePlayer from '@/components/player/GamePlayer';
import type { Project } from '@/types/game';

interface PublishedWorldPlayerProps {
  /** Built from the frozen release snapshot, never from the live project graph. */
  project: Project;
  releaseId: string;
  worldIdentity: { templateId: string; templateVersion: number };
}

/**
 * Plays a published world release and offers a remix.
 *
 * `missionReporting` is deliberately not passed through: mission progress is a
 * private authoring signal tied to a live project revision, and a public
 * visitor playing a frozen snapshot has no revision of their own to report.
 */
export default function PublishedWorldPlayer({ project, releaseId, worldIdentity }: PublishedWorldPlayerProps) {
  const router = useRouter();
  const [remixState, setRemixState] = useState<'idle' | 'working' | 'unavailable' | 'signin'>('idle');

  const remix = useCallback(async () => {
    if (remixState === 'working') return;
    setRemixState('working');
    try {
      const response = await fetch(`/api/world-releases/${encodeURIComponent(releaseId)}/remix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (response.status === 401) {
        setRemixState('signin');
        return;
      }
      if (!response.ok) {
        setRemixState('unavailable');
        return;
      }
      const { project: created } = await response.json();
      router.push(`/projects/${created.id}`);
    } catch {
      setRemixState('unavailable');
    }
  }, [releaseId, remixState, router]);

  return (
    <div className="flex flex-col gap-4">
      <GamePlayer project={project} worldIdentity={worldIdentity} />

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={remix}
          disabled={remixState === 'working'}
          className="rounded-full bg-indigo-600 px-6 py-3 text-lg font-semibold text-white shadow transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {remixState === 'working' ? 'Making your copy…' : 'Remix this world'}
        </button>

        {remixState === 'signin' && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Sign in to make your own copy of this world.
          </p>
        )}
        {remixState === 'unavailable' && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This world can&apos;t be copied right now. Try again in a bit.
          </p>
        )}
      </div>
    </div>
  );
}
