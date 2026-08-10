import { getAuthenticatedUser, query, queryOne } from '@/lib/mysql/server';
import GamePlayer from '@/components/player/GamePlayer';
import type { Project } from '@/types/game';

interface PlayPageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { id } = await params;
  const user = await getAuthenticatedUser();

  // Fetch project data
  const project = await queryOne<{
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    visibility: string;
  }>('SELECT * FROM projects WHERE id = ?', [id]);

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Game Not Found</h1>
          <p className="text-gray-600">The game you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  // Check access
  if (user) {
    const profile = await queryOne<{ id: string }>(
      'SELECT id FROM profiles WHERE user_id = ?',
      [user.id]
    );
    
    if (profile && project.owner_id !== profile.id && project.visibility !== 'public') {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
            <p className="text-gray-600">You don't have permission to play this game.</p>
          </div>
        </div>
      );
    }
  } else {
    if (project.visibility !== 'public') {
      // Guests can access their own projects
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
  }>('SELECT * FROM scenes WHERE project_id = ? ORDER BY order_index', [id]);

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
        `SELECT * FROM game_objects WHERE scene_id IN (${sceneIds.map(() => '?').join(',')})`,
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
        `SELECT * FROM logic_blocks WHERE game_object_id IN (${gameObjectIds.map(() => '?').join(',')})`,
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

