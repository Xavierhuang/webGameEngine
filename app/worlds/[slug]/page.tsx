import { notFound } from 'next/navigation';
import { query } from '@/lib/mysql/server';
import { resolveCurrentActor } from '@/lib/auth/actor';
import { getPublicWorldReleaseSnapshot } from '@/lib/worlds/releaseAccess';
import PublishedWorldPlayer from '@/components/worlds/PublishedWorldPlayer';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import type { Project } from '@/types/game';

interface PublicWorldPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The public page for one approved world release.
 *
 * Everything rendered here comes from the frozen snapshot. This page never
 * calls `requireProjectView` or `writePlaySnapshot`: a published world is not a
 * view of a project, it is a view of one immutable release, and a slug that is
 * not currently public is indistinguishable from one that never existed.
 */
export default async function PublicWorldPage({ params }: PublicWorldPageProps) {
  const { slug } = await params;
  const published = await getPublicWorldReleaseSnapshot(slug);
  if (!published) notFound();

  const { release, snapshot, worldIdentity } = published;

  // Best-effort play count against the release's source project, excluding the
  // creator so previewing your own published world does not inflate it — the
  // same rule `app/play/[id]/page.tsx` applies. Resolving the actor is used for
  // that exclusion only; it never gates access, because a published release is
  // public by definition. A counter failure must never take down a world.
  try {
    const viewer = await resolveCurrentActor();
    const isCreator = viewer.kind !== 'anonymous' && viewer.profileId === snapshot.project.owner_id;
    if (!isCreator) {
      await query(
        'UPDATE projects SET play_count = play_count + 1, last_played_at = CURRENT_TIMESTAMP WHERE id = ?',
        [snapshot.project.id],
      );
    }
  } catch (error) {
    console.error('[world-release] failed to record play count:', error);
  }

  const projectData = {
    ...snapshot.project,
    scenes: snapshot.scenes.map((scene) => ({ ...scene, game_objects: scene.objects })),
  } as unknown as Project;

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav />
      <PageBackdrop />
      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{release.title}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">by {release.creatorLabel}</p>
          {release.description && (
            <p className="mt-2 text-base text-slate-700 dark:text-slate-200">{release.description}</p>
          )}
        </header>

        <PublishedWorldPlayer project={projectData} releaseId={release.id} worldIdentity={worldIdentity} />
      </main>
    </div>
  );
}
