import { getAuthenticatedUser, query, queryOne } from '@/lib/mysql/server';
import Link from 'next/link';
import { Plus, Play, Edit, Trash2 } from 'lucide-react';

export default async function ProjectsPage(props: {
  searchParams?: Promise<{ signup?: string }>;
}) {
  const searchParams = await props.searchParams;

  // Allow both authenticated and guest users
  const user = await getAuthenticatedUser();
  
  let projects: any[] = [];
  let displayName = 'Guest';
  let profile: any = null;

  if (user) {
  // Get user profile to check approval status
    profile = await queryOne<{
      id: string;
      role: string;
      parental_approval: boolean;
      can_publish: boolean;
      can_share: boolean;
      display_name: string | null;
      username: string | null;
    }>(
      'SELECT id, role, parental_approval, can_publish, can_share, display_name, username FROM profiles WHERE user_id = ?',
      [user.id]
    );

    if (profile) {
      const projectsData = await query<{
        id: string;
        owner_id: string;
        title: string;
        description: string | null;
        thumbnail_url: string | null;
        is_published: boolean;
        is_template: boolean;
        visibility: string;
        genre: string | null;
        created_at: Date;
        updated_at: Date;
        last_played_at: Date | null;
        play_count: number;
        like_count: number;
        moderation_status: string;
        moderation_notes: string | null;
      }>(
        'SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC',
        [profile.id]
      );
      projects = projectsData;
      displayName = profile.display_name || profile.username || 'Player';
    }
  }

  // Check for signup success
  const signupSuccess = searchParams?.signup === 'success';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100">
      <div className="container mx-auto px-4 py-8">
        {/* Success message */}
        {signupSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-6 py-4 rounded-lg">
            <p className="font-bold">🎉 Welcome! Your account has been created successfully!</p>
            <p className="text-sm mt-1">You can now start creating amazing games!</p>
          </div>
        )}
        {/* Guest user message */}
        {!user && (
          <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-6 py-4 rounded-lg">
            <p className="font-bold">👋 Welcome! You&apos;re creating as a guest.</p>
            <p className="text-sm mt-1">
              <Link href="/auth/signup" className="underline font-semibold">Sign up</Link> to save your games permanently and access all features!
            </p>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-purple-600">
              {displayName}&apos;s Games
            </h1>
            {profile && !profile.parental_approval && profile.role === 'child' && (
              <div className="mt-2 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-lg text-sm">
                ⚠️ Waiting for parent approval. You can create games, but some features are limited.
              </div>
            )}
            <p className="text-gray-600 mt-2">
              Create amazing games and share them with the world!
            </p>
          </div>
          <Link
            href="/projects/new"
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform shadow-lg"
          >
            <Plus className="w-5 h-5" />
            New Game
          </Link>
        </div>

        {/* Projects Grid */}
        {projects && projects.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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

function ProjectCard({ project }: { project: any }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all hover:scale-105">
      {/* Thumbnail */}
      <div className="h-48 bg-gradient-to-br from-purple-200 to-blue-200 flex items-center justify-center">
        {project.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-6xl">🎮</div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-xl font-bold text-gray-800 mb-2">
          {project.title}
        </h3>
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
          {project.description || 'No description yet'}
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href={`/editor/${project.id}`}
            className="flex-1 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
          <Link
            href={`/play/${project.id}`}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            Play
          </Link>
        </div>

        {/* Meta */}
        <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
          <p>Updated {new Date(project.updated_at).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="text-8xl mb-6">🎮</div>
      <h2 className="text-3xl font-bold text-gray-700 mb-4">
        No games yet!
      </h2>
      <p className="text-gray-600 mb-8">
        Start creating your first game and let your imagination run wild!
      </p>
      <Link
        href="/projects/new"
        className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-full font-bold inline-flex items-center gap-2 hover:scale-105 transition-transform shadow-lg"
      >
        <Plus className="w-5 h-5" />
        Create Your First Game
      </Link>
    </div>
  );
}

