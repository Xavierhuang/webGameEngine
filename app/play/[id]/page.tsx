import { query, queryOne } from '@/lib/mysql/server';
import { notFound } from 'next/navigation';
import { resolveCurrentActor } from '@/lib/auth/actor';
import { requireProjectView } from '@/lib/auth/access';
import GamePlayer from '@/components/player/GamePlayer';
import type { Project } from '@/types/game';
import Link from 'next/link';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { ArrowLeft, Ghost, Lock } from 'lucide-react';
import { CommandServiceError, writePlaySnapshot } from '@/lib/projects/commandService';
import type { ProjectSnapshot } from '@/lib/projects/projectSnapshot';

interface PlayPageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { id } = await params;
  const actor = await resolveCurrentActor();
  let authorized;
  try {
    authorized = await requireProjectView(actor, id);
  } catch {
    notFound();
  }

  const rendered = await createRenderedPlaySnapshot(id);
  if (!rendered) notFound();

  const worldIdentity = await queryOne<{ project_id: string }>(
    'SELECT project_id FROM project_worlds WHERE project_id = ?',
    [id],
  );

  // Count the play. `play_count` and `last_played_at` have been rendered in the
  // UI since the initial schema but nothing ever wrote to them. Owners playing
  // their own game don't inflate the count.
  if (!authorized.access.isOwner) {
    try {
      await query(
        'UPDATE projects SET play_count = play_count + 1, last_played_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );
    } catch (error) {
      console.error('[play] failed to record play count:', error);
    }
  }

  const projectData = {
    ...rendered.snapshot.project,
    scenes: rendered.snapshot.scenes.map((scene) => ({
      ...scene,
      game_objects: scene.objects,
    })),
  };

  return (
    <GamePlayer
      project={projectData as unknown as Project}
      missionReporting={worldIdentity ? { projectId: id, revision: rendered.revision, snapshotId: rendered.snapshotId } : undefined}
    />
  );
}

async function createRenderedPlaySnapshot(projectId: string): Promise<{
  snapshotId: string;
  revision: number;
  snapshot: ProjectSnapshot;
} | null> {
  // The revision read is merely the optimistic precondition; writePlaySnapshot
  // locks it, captures one immutable graph, and reports a conflict if an edit
  // won the race. Rendering always reads that captured graph, never live rows.
  for (let attempt = 0; attempt < 2; attempt++) {
    const project = await queryOne<{ revision: number | string }>('SELECT revision FROM projects WHERE id = ?', [projectId]);
    if (!project) return null;
    try {
      const written = await writePlaySnapshot({ projectId, expectedRevision: Number(project.revision) });
      const row = await queryOne<{ snapshot_json: unknown }>(
        'SELECT snapshot_json FROM project_play_snapshots WHERE id = ? AND project_id = ?',
        [written.snapshotId, projectId],
      );
      if (!row) return null;
      const snapshot = typeof row.snapshot_json === 'string' ? JSON.parse(row.snapshot_json) : row.snapshot_json;
      if (!snapshot || typeof snapshot !== 'object') return null;
      return { snapshotId: written.snapshotId, revision: written.revision, snapshot: snapshot as ProjectSnapshot };
    } catch (error) {
      if (error instanceof CommandServiceError && error.httpStatus === 409) continue;
      throw error;
    }
  }
  return null;
}

function PlayerErrorScreen({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="relative min-h-screen bg-white overflow-hidden">
      <AppNav />
      <PageBackdrop />
      <div className="relative flex items-center justify-center px-4 py-24">
        <div className="max-w-md w-full text-center rounded-3xl border border-slate-200 bg-white shadow-xl p-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 text-slate-700 mb-4">
            {icon}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-slate-600">{body}</p>
          <Link
            href="/projects"
            className="mt-6 inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-5 py-2.5 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to My Games
          </Link>
        </div>
      </div>
    </div>
  );
}
