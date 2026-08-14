import { getAuthenticatedUser, query, queryOne } from '@/lib/mysql/server';
import Link from 'next/link';
import { Play, Search, Heart, GitFork, Sparkles } from 'lucide-react';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { getTranslator } from '@/lib/i18n/server';

const SORTS: Record<string, { labelKey: 'explore.sort.newest' | 'explore.sort.loved' | 'explore.sort.remixed' | 'explore.sort.played'; order: string }> = {
  newest: { labelKey: 'explore.sort.newest', order: 'p.created_at DESC' },
  loved: { labelKey: 'explore.sort.loved', order: 'p.like_count DESC, p.created_at DESC' },
  remixed: { labelKey: 'explore.sort.remixed', order: 'p.remix_count DESC, p.created_at DESC' },
  played: { labelKey: 'explore.sort.played', order: 'p.play_count DESC, p.created_at DESC' },
};

/**
 * The public gallery.
 *
 * Until now the only "gallery" was six hardcoded fake cards on the landing page
 * that linked to /projects/new. This is the real thing: it lists projects that
 * are both shared publicly AND have cleared moderation.
 */
export default async function ExplorePage(props: {
  searchParams?: Promise<{ q?: string; sort?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await getAuthenticatedUser();
  const t = await getTranslator();

  const rawQuery = (searchParams?.q ?? '').trim().substring(0, 100);
  const sortKey = searchParams?.sort && SORTS[searchParams.sort] ? searchParams.sort : 'newest';

  let displayName = 'Guest';
  if (user) {
    try {
      const profile = await queryOne<{ display_name: string | null; username: string | null }>(
        'SELECT display_name, username FROM profiles WHERE user_id = ?',
        [user.id]
      );
      displayName = profile?.display_name || profile?.username || 'Player';
    } catch {
      displayName = 'Player';
    }
  }

  const where = ["p.visibility = 'public'", "p.moderation_status = 'approved'"];
  const args: any[] = [];
  if (rawQuery) {
    where.push('(p.title LIKE ? OR p.description LIKE ?)');
    args.push(`%${rawQuery}%`, `%${rawQuery}%`);
  }

  // Unlike the other pages, this one always hits the database — there is no
  // signed-out short circuit. An unreachable DB used to 500 the whole page
  // rather than showing the empty state, so a transient blip took Explore down.
  let projects: any[] = [];
  try {
    projects = await query<any>(
      `SELECT p.id, p.title, p.description, p.thumbnail_url, p.genre, p.created_at,
              p.play_count, p.like_count, p.remix_count, p.remixed_from,
              author.display_name AS author_name, author.username AS author_username,
              parent.title AS parent_title
       FROM projects p
       LEFT JOIN profiles author ON author.id = p.owner_id
       LEFT JOIN projects parent ON parent.id = p.remixed_from
       WHERE ${where.join(' AND ')}
       ORDER BY ${SORTS[sortKey].order}
       LIMIT 48`,
      args
    );
  } catch (error) {
    console.error('[explore] project query failed:', error);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav signedInAs={user ? displayName : undefined} />
      <PageBackdrop />

      <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">{t('explore.title')}</h1>
          <p className="mt-1 text-slate-600">
            {t('explore.subtitle')}
          </p>
        </div>

        <form method="GET" className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={rawQuery}
              placeholder={t('explore.search')}
              className="w-full rounded-full border border-slate-200 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition focus:border-slate-400"
            />
          </div>
          <div className="flex gap-1.5">
            {Object.entries(SORTS).map(([key, { labelKey }]) => (
              <Link
                key={key}
                href={`/explore?sort=${key}${rawQuery ? `&q=${encodeURIComponent(rawQuery)}` : ''}`}
                className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  key === sortKey
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {t(labelKey)}
              </Link>
            ))}
          </div>
        </form>

        {projects.length === 0 ? (
          <EmptyState hasQuery={Boolean(rawQuery)} t={t} />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project) => (
              <ExploreCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExploreCard({ project }: { project: any }) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-xl">
      <Link href={`/projects/${project.id}`} className="block">
        <div className="relative h-40 bg-gradient-to-br from-blue-200 via-purple-200 to-pink-200">
          {project.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.thumbnail_url}
              alt={project.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow-lg transition-transform group-hover:scale-110">
              {genreEmoji(project.genre)}
            </div>
          )}
          {project.genre && (
            <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
              {project.genre}
            </span>
          )}
        </div>
      </Link>

      <div className="p-4">
        <Link href={`/projects/${project.id}`}>
          <h3 className="truncate font-bold text-slate-900 hover:underline">{project.title}</h3>
        </Link>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          by {project.author_name || 'Someone'}
        </p>

        {project.parent_title && (
          <p className="mt-1.5 truncate text-xs text-slate-400">
            <GitFork className="mr-1 inline h-3 w-3" />
            remix of {project.parent_title}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {project.like_count ?? 0}
          </span>
          <span className="inline-flex items-center gap-1">
            <GitFork className="h-3.5 w-3.5" />
            {project.remix_count ?? 0}
          </span>
          <span className="inline-flex items-center gap-1">
            <Play className="h-3.5 w-3.5" />
            {project.play_count ?? 0}
          </span>
        </div>

        <Link
          href={`/play/${project.id}`}
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Play className="h-3.5 w-3.5" />
          Play
        </Link>
      </div>
    </div>
  );
}

function EmptyState({ hasQuery, t }: { hasQuery: boolean; t: (k: any) => string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
      <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-400" />
      <p className="font-bold text-slate-800">
        {hasQuery ? t('explore.empty.search') : t('explore.empty.title')}
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
        {hasQuery
          ? t('explore.empty.search')
          : t('explore.empty.body')}
      </p>
      <Link
        href="/projects/new"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        {t('explore.makeAGame')}
      </Link>
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
