import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireAuth, queryOne } from '@/lib/mysql/server';
import GameEditor from '@/components/editor/GameEditor';
import { CollaborationProvider } from '@/components/realtime/CollaborationProvider';

interface EditorPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { id } = await params;
  
  // Allow both authenticated and guest users
  const { getAuthenticatedUser } = await import('@/lib/mysql/server');
  const user = await getAuthenticatedUser();
  
  let profileId: string | null = null;
  if (user) {
    const profile = await queryOne<{ id: string }>(
      'SELECT id FROM profiles WHERE user_id = ?',
      [user.id]
    );
    profileId = profile?.id || null;
  }

  // Fetch project
  const project = await queryOne<{
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
  }>('SELECT * FROM projects WHERE id = ?', [id]);

  if (!project) {
    notFound();
  }

  // Check ownership (only if user is authenticated)
  // Guest users can access projects they created (we'll handle this client-side)
  if (user && profileId && project.owner_id !== profileId) {
    // Check if it's a public project
    if (project.visibility !== 'public' || !project.is_published) {
    notFound();
  }
  }

  // Fetch related data
  const { query } = await import('@/lib/mysql/server');
  
  const scenes = await query<{
    id: string;
    project_id: string;
    name: string;
    order_index: number;
    background_color: string;
    background_image_url: string | null;
    physics_enabled: boolean;
    gravity_y: number;
    created_at: Date;
    updated_at: Date;
  }>('SELECT * FROM scenes WHERE project_id = ? ORDER BY order_index', [id]);

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
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT * FROM game_objects WHERE scene_id IN (${sceneIds.map(() => '?').join(',')})`,
        sceneIds
      )
    : [];

  const gameObjectIds = gameObjects.map((go) => go.id);
  const logicBlocks = gameObjectIds.length > 0
    ? await query<{
        id: string;
        game_object_id: string | null;
        project_id: string | null;
        scene_id: string | null;
        block_type: string;
        category: string;
        parent_block_id: string | null;
        order_index: number;
        block_data: any;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT * FROM logic_blocks WHERE game_object_id IN (${gameObjectIds.map(() => '?').join(',')})`,
        gameObjectIds
      )
    : [];

  const assets = await query<{
    id: string;
    project_id: string | null;
    owner_id: string;
    asset_type: string;
    name: string;
    file_url: string;
    file_size: number | null;
    mime_type: string | null;
    frame_width: number | null;
    frame_height: number | null;
    frame_count: number | null;
    generated_by_ai: boolean;
    generation_prompt: string | null;
    moderation_status: string;
    created_at: Date;
  }>('SELECT * FROM assets WHERE project_id = ?', [id]);

  // Structure the response with nested relations (mirrors what a single Supabase select-with-joins used to return)
  const projectWithRelations = {
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
    assets,
  };

  // Get user info for collaboration
  let userId = 'guest';
  let username = 'Guest';
  
  if (user) {
    userId = user.id;
    const userProfile = await queryOne<{ username: string | null; display_name: string | null }>(
      'SELECT username, display_name FROM profiles WHERE user_id = ?',
      [user.id]
    );
    username = userProfile?.username || userProfile?.display_name || 'Player';
  }

  return (
    <CollaborationProvider
      projectId={id}
      userId={userId}
      username={username}
    >
      <GameEditor projectId={id} initialData={projectWithRelations} />
    </CollaborationProvider>
  );
}

export async function generateMetadata({ params }: EditorPageProps) {
  const { id } = await params;
  return {
    title: 'Game Editor - Kids Game Builder',
    description: 'Create your amazing game!',
  };
}

