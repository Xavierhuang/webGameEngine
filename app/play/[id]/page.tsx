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

  // Fetch project data
  const project = await queryOne<{
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    visibility: string;
    moderation_status: string;
  }>(
    `SELECT id, title, description, visibility, moderation_status
       FROM projects WHERE id = ?`,
    [id]
  );

  if (!project) {
    notFound();
  }

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

  // Fetch scenes
  const scenes = await query<{
    id: string;
    project_id: string;
    name: string;
    order_index: number;
    background_color: string;
    background_image_url: string | null;
    physics_enabled: boolean;
    gravity_y: number;
  }>(
    `SELECT id, project_id, name, order_index, background_color,
            background_image_url, physics_enabled, gravity_y
       FROM scenes WHERE project_id = ? ORDER BY order_index`,
    [id]
  );

  // Fetch game objects
  const sceneIds = scenes.map((s) => s.id);
  const gameObjects = sceneIds.length > 0
    ? await query<{
        id: string;
        scene_id: string;
        type: string;
        name: string;
        position_x: number;
        position_y: number;
        position_z: number;
        rotation: number;
        scale_x: number;
        scale_y: number;
        sprite_url: string | null;
        color: string | null;
        width: number | null;
        height: number | null;
        has_physics: boolean;
        is_static: boolean;
        mass: number;
        properties: any;
      }>(
        `SELECT id, scene_id, type, name, position_x, position_y, position_z,
                rotation, scale_x, scale_y, sprite_url, color, width, height,
                has_physics, is_static, mass, properties
           FROM game_objects
          WHERE scene_id IN (${sceneIds.map(() => '?').join(',')})
          ORDER BY order_index, created_at`,
        sceneIds
      )
    : [];

  // Fetch logic blocks
  const gameObjectIds = gameObjects.map((go) => go.id);
  const logicBlocks = gameObjectIds.length > 0
    ? await query<{
        id: string;
        game_object_id: string | null;
        project_id: string | null;
        block_type: string;
        category: string;
        order_index: number;
        block_data: any;
      }>(
        `SELECT id, game_object_id, block_type, category, order_index, block_data
           FROM logic_blocks WHERE game_object_id IN (${gameObjectIds.map(() => '?').join(',')})`,
        gameObjectIds
      )
    : [];

  // Structure the data
  const projectData = {
    ...project,
    scenes: scenes.map((scene) => ({
      ...scene,
      game_objects: gameObjects
        .filter((go) => go.scene_id === scene.id)
        .map((go) => ({
          ...go,
          logic_blocks: logicBlocks.filter(
            (lb) => lb.game_object_id === go.id
          ),
        })),
    })),
  };

  return <GamePlayer project={projectData as unknown as Project} />;
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
