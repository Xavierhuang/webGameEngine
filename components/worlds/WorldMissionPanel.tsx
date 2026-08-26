'use client';

import { useEffect, useState } from 'react';
import type { MissionProgress } from '@/lib/worlds/missionService';

interface WorldMissionPanelProps {
  projectId: string;
  initialMissions: MissionProgress[];
}

export default function WorldMissionPanel({ projectId, initialMissions }: WorldMissionPanelProps) {
  const [dismissed, setDismissed] = useState(false);
  // Mission progress belongs to the editor's project state, so render the
  // latest prop directly instead of keeping a duplicate state copy.
  const missions = initialMissions;

  useEffect(() => {
    try {
      // This value exists only in the browser. Reading it after hydration
      // keeps the server and client markup identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(window.localStorage.getItem(`lingplay.world-missions:${projectId}`) === 'dismissed');
    } catch {
      // Optional guidance should not fail in private browsing.
    }
  }, [projectId]);

  if (dismissed) return null;
  return (
    <section className="border-t border-sky-100 bg-sky-50/60 p-4" aria-label="Build missions">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Build missions</h2>
          <p className="mt-0.5 text-xs text-slate-600">Optional ideas for your private draft.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try { window.localStorage.setItem(`lingplay.world-missions:${projectId}`, 'dismissed'); } catch {}
          }}
          className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
        >
          Dismiss
        </button>
      </div>
      <ol className="mt-3 space-y-2">
        {missions.map((mission) => (
          <li key={mission.id} className="rounded-lg border border-sky-100 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{mission.title}</p>
              {mission.status === 'completed' && <span className="text-xs font-bold text-emerald-700">Completed</span>}
            </div>
            <p className="mt-0.5 text-xs text-slate-600">{mission.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
