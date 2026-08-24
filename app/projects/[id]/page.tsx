import { query, queryOne } from '@/lib/mysql/server';
import { notFound } from 'next/navigation';
import { resolveCurrentActor } from '@/lib/auth/actor';
import { requireProjectView } from '@/lib/auth/access';
import Link from 'next/link';
import { Play, Edit, GitFork, Heart, Ghost, Lock } from 'lucide-react';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { RemixButton } from '@/components/projects/RemixButton';
import { LikeButton } from '@/components/projects/LikeButton';
import { ReportButton } from '@/components/projects/ReportButton';
import { getTranslator } from '@/lib/i18n/server';

/**
 * A project's landing page — title, author, description, and the Remix button.
 *
 * There was previously no project page at all: only /editor/[id] (authoring)
 * and /play/[id] (runtime), so a shared game had nowhere to live.
 */
export default async function ProjectPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const actor = await resolveCurrentActor();
  const t = await getTranslator();

  let authorized;
  try {
    authorized = await requireProjectView(actor, id);
  } catch {
    notFound();
  }

  const project = await queryOne<any>(
    `SELECT p.*, author.display_name AS author_name, author.username AS author_username,
            parent.title AS parent_title, parent.id AS parent_id
     FROM projects p
     LEFT JOIN profiles author ON author.id = p.owner_id
     LEFT JOIN projects parent
       ON parent.id = p.remixed_from
      AND parent.visibility = 'public'
      AND parent.is_published = TRUE
      AND parent.moderation_status = 'published'
     WHERE p.id = ?`,
    [id]
  );

  if (!project) notFound();

  const remixes = await query<{ id: string; title: string }>(
    `SELECT id, title FROM projects
     WHERE remixed_from = ? AND visibility = 'public' AND is_published = TRUE AND moderation_status = 'published'
     ORDER BY created_at DESC LIMIT 8`,
    [id]
  );

  return (
    <Shell signedInAs={actor.kind !== 'anonymous' ? project.author_name : undefined}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="relative flex h-64 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-200 via-purple-200 to-pink-200">
            {project.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={project.thumbnail_url} alt={project.title} className="h-full w-full object-cover" />
            ) : (
              <span className="text-7xl drop-shadow-lg">{genreEmoji(project.genre)}</span>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={`/play/${project.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Play className="h-4 w-4" />
              {t('project.play')}
            </Link>

            <RemixButton projectId={project.id} />

            <LikeButton projectId={project.id} initialCount={project.like_count ?? 0} />

            {authorized.access.isOwner ? (
              <Link
                href={`/editor/${project.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-300"
              >
                <Edit className="h-4 w-4" />
                {t('project.edit')}
              </Link>
            ) : (
              <ReportButton projectId={project.id} />
            )}
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">{project.title}</h1>
          <p className="mt-1 text-slate-600">{t('project.by')} {project.author_name || 'Someone'}</p>

          {project.parent_title && (
            <p className="mt-3 text-sm text-slate-500">
              <GitFork className="mr-1 inline h-3.5 w-3.5" />
              Remixed from{' '}
              <Link href={`/projects/${project.parent_id}`} className="font-semibold underline">
                {project.parent_title}
              </Link>
            </p>
          )}

          <p className="mt-5 whitespace-pre-line leading-relaxed text-slate-700">
            {project.description || t('project.noDescription')}
          </p>

          <dl className="mt-6 flex gap-6 text-sm text-slate-600">
            <Stat icon={<Heart className="h-4 w-4" />} value={project.like_count ?? 0} label={t('project.loves')} />
            <Stat icon={<GitFork className="h-4 w-4" />} value={project.remix_count ?? 0} label={t('project.remixes')} />
            <Stat icon={<Play className="h-4 w-4" />} value={project.play_count ?? 0} label={t('project.plays')} />
          </dl>

          {remixes.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Remixes of this game
              </h2>
              <ul className="mt-2 space-y-1">
                {remixes.map((remix) => (
                  <li key={remix.id}>
                    <Link
                      href={`/projects/${remix.id}`}
                      className="text-sm text-slate-700 hover:underline"
                    >
                      {remix.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, signedInAs }: { children: React.ReactNode; signedInAs?: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav signedInAs={signedInAs} />
      <PageBackdrop />
      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-10">{children}</div>
    </div>
  );
}

function Message({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        {icon}
      </div>
      <p className="font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{children}</p>
      <Link
        href="/explore"
        className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Browse other games
      </Link>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="font-semibold text-slate-900">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function genreEmoji(genre: string | null | undefined): string {
  switch ((genre ?? '').toLowerCase()) {
    case 'platformer': return '🏃';
    case 'puzzle': return '🧩';
    case 'adventure': return '🗺️';
    case 'racing': return '🏎️';
    case 'arcade': return '🕹️';
    default: return '🎮';
  }
}
