import { notFound } from 'next/navigation';
import { query, queryOne } from '@/lib/mysql/server';
import { resolveCurrentActor } from '@/lib/auth/actor';
import { requireProjectEdit } from '@/lib/auth/access';
import GameEditor from '@/components/editor/GameEditor';
import { MobileEditorGate } from '@/components/editor/MobileEditorGate';
import { CollaborationProvider } from '@/components/realtime/CollaborationProvider';
import { getWorldTemplate } from '@/lib/worlds/templates';
import { getMissionProgress, type MissionProgress } from '@/lib/worlds/missionService';

interface EditorPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { id } = await params;

  const actor = await resolveCurrentActor();
  try {
    await requireProjectEdit(actor, id);
  } catch {
    notFound();
  }
  if (actor.kind === 'anonymous') notFound();

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
    revision: number | string;
  }>('SELECT * FROM projects WHERE id = ?', [id]);

  if (!project) {
    notFound();
  }

  const worldIdentity = await queryOne<{ template_id: string; template_version: number | string }>(
    'SELECT template_id, template_version FROM project_worlds WHERE project_id = ?',
    [id],
  );
  const template = worldIdentity
    ? getWorldTemplate(worldIdentity.template_id, Number(worldIdentity.template_version))
    : null;
  let missionProgress: MissionProgress[] = [];
  if (template) {
    try {
      missionProgress = await getMissionProgress({ actor, projectId: id });
    } catch {
      // The editor has already passed the centralized edit check. Keep a
      // private draft editable if optional guidance cannot load.
    }
  }

  // Fetch related data
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
        // ORDER BY is load-bearing, not tidiness. A script is a flat ordered
        // array — a hat block owns the blocks that follow it — so unordered
        // rows are a shuffled program. MySQL returned them in roughly primary
        // key order, which for a UUID key is arbitrary, so every published
        // game and every project opened in the editor ran its blocks in a
        // random order. It looked like a working game that behaved oddly.
        `SELECT * FROM logic_blocks WHERE game_object_id IN (${gameObjectIds.map(() => '?').join(',')})
         ORDER BY game_object_id, order_index`,
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
  let userId = actor.kind === 'user' ? actor.userId : actor.profileId;
  let username = 'Guest';
  const userProfile = await queryOne<{ username: string | null; display_name: string | null }>(
    'SELECT username, display_name FROM profiles WHERE id = ?',
    [actor.profileId]
  );
  username = userProfile?.username || userProfile?.display_name || 'Player';

  return (
    <MobileEditorGate>
      <CollaborationProvider
        projectId={id}
        userId={userId}
        username={username}
      >
        <GameEditor
          projectId={id}
          initialData={projectWithRelations}
          worldBuilder={template ? {
            templateId: worldIdentity?.template_id ?? template.id,
            templateTitle: template.title,
            templateVersion: Number(worldIdentity?.template_version),
            revision: Number(project.revision),
            missions: missionProgress,
          } : undefined}
        />
      </CollaborationProvider>
    </MobileEditorGate>
  );
}

export async function generateMetadata({ params }: EditorPageProps) {
  const { id } = await params;
  return {
    title: 'Game Editor - Kids Game Builder',
    description: 'Create your amazing game!',
  };
}
