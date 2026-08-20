import { query, queryOne } from '@/lib/mysql/server';
import { resolveCurrentActor } from '@/lib/auth/actor';
import Link from 'next/link';
import { Plus, Play, Edit, Sparkles } from 'lucide-react';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { ImportButton } from '@/components/projects/ImportButton';
import { getTranslator } from '@/lib/i18n/server';
import { getProjectModerationBadge } from '@/lib/auth/publicationState';

export default async function ProjectsPage(props: {
  searchParams?: Promise<{ signup?: string }>;
}) {
  const searchParams = await props.searchParams;

  const actor = await resolveCurrentActor();
  const t = await getTranslator();

  let projects: any[] = [];
  let displayName = 'Guest';
  let profile: any = null;

  if (actor.kind !== 'anonymous') {
    profile = await queryOne<{
      id: string;
      role: string;
      parental_approval: boolean;
      can_publish: boolean;
      can_share: boolean;
      display_name: string | null;
      username: string | null;
    }>(
      'SELECT id, role, parental_approval, can_publish, can_share, display_name, username FROM profiles WHERE id = ?',
      [actor.profileId]
    );

    if (profile) {
      const projectsData = await query<any>(
        'SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC',
        [profile.id]
      );
      projects = projectsData;
      displayName = profile.display_name || profile.username || 'Player';
    }
  }

  const signupSuccess = searchParams?.signup === 'success';

  return (
    <div className="relative min-h-screen bg-white overflow-hidden">
      <AppNav signedInAs={actor.kind !== 'anonymous' ? displayName : undefined} />
      <PageBackdrop />

      <div className="relative max-w-7xl mx-auto px-6 pt-10 pb-20">
        {signupSuccess && (
          <NotificationBar
            tone="success"
            title="Welcome! Your account is ready."
            body="Start creating games — every project you make is saved to your account."
          />
        )}
        {actor.kind === 'anonymous' && (
          <NotificationBar
            tone="info"
            title="You're creating as a guest."
            body={
              <>
                <Link href="/auth/signup" className="font-semibold underline">Sign up</Link> to save your games permanently.
              </>
            }
          />
        )}
        {profile && !profile.parental_approval && profile.role === 'child' && (
          <NotificationBar
            tone="warning"
            title="Waiting for parent approval."
            body="You can build and play locally — some sharing features unlock once a parent approves the account."
          />
        )}

        <div className="flex items-end justify-between flex-wrap gap-4 mb-8 mt-2">
          <div>
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              {actor.kind === 'user' ? t('projects.signedIn') : t('projects.guestMode')}
            </div>
            <h1 className="mt-1 text-4xl font-black tracking-tight text-slate-900">
              {displayName}&apos;s Games
            </h1>
            <p className="mt-2 text-slate-600 max-w-xl">
              Every project you build lives here. Open one to keep editing, or start a fresh world.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ImportButton />
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-6 py-3 shadow-lg shadow-slate-900/10 transition"
            >
              <Plus className="w-4 h-4" />
              {t('projects.newGame')}
            </Link>
          </div>
        </div>

        {projects && projects.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function NotificationBar({
  tone,
  title,
  body,
}: {
  tone: 'success' | 'info' | 'warning';
  title: string;
  body: React.ReactNode;
}) {
  const tones = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
  };
  return (
    <div className={`mb-6 rounded-2xl border px-5 py-4 ${tones[tone]}`}>
      <p className="font-bold">{title}</p>
      <p className="text-sm mt-1 opacity-90">{body}</p>
    </div>
  );
}

function ProjectCard({ project }: { project: any }) {
  return (
    <div className="group rounded-2xl overflow-hidden border border-slate-200 bg-white hover:shadow-xl hover:border-slate-300 transition">
      <div className="relative h-40 bg-gradient-to-br from-blue-200 via-purple-200 to-pink-200">
        {project.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.thumbnail_url}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow-lg group-hover:scale-110 transition-transform">
            {genreEmoji(project.genre)}
          </div>
        )}
        <ModerationBadge status={project.moderation_status} visibility={project.visibility} />
        {project.genre && (
          <span className="absolute bottom-3 left-3 text-[10px] font-bold uppercase tracking-wider bg-white/90 text-slate-700 rounded-full px-2 py-0.5">
            {project.genre}
          </span>
        )}
      </div>

      <div className="p-4">
        <h2 className="font-bold text-slate-900 truncate">{project.title}</h2>
        <p className="mt-1 text-sm text-slate-500 line-clamp-2 min-h-[2.5rem]">
          {project.description || 'No description yet.'}
        </p>

        <div className="mt-4 flex gap-2">
          <Link
            href={`/editor/${project.id}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg px-3 py-2 transition"
          >
            <Edit className="w-3.5 h-3.5" />
            Edit
          </Link>
          <Link
            href={`/play/${project.id}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 text-sm font-semibold rounded-lg px-3 py-2 transition"
          >
            <Play className="w-3.5 h-3.5" />
            Play
          </Link>
        </div>

        <div className="mt-3 text-xs text-slate-400">
          Updated {new Date(project.updated_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

function ModerationBadge({ status, visibility }: { status?: string; visibility?: string }) {
  const badge = getProjectModerationBadge(status, visibility);
  if (!badge) return null;
  return (
    <span
      className={`absolute top-3 right-3 ${badge.bg} text-white text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-0.5 shadow`}
    >
      {badge.label}
    </span>
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

function EmptyState() {
  return (
    <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-16 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-sm mb-6">
        <Sparkles className="w-7 h-7 text-slate-400" />
      </div>
      <h2 className="text-2xl font-black text-slate-900">
        No games yet — let&apos;s fix that.
      </h2>
      <p className="mt-2 text-slate-600 max-w-md mx-auto">
        Start with a blank 3D world, or describe one to the AI and it&apos;ll scaffold the whole project for you.
      </p>
      <div className="mt-6">
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-6 py-3 shadow-lg shadow-slate-900/10 transition"
        >
          <Plus className="w-4 h-4" />
          Create Your First Game
        </Link>
      </div>
    </div>
  );
}
