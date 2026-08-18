import { query, queryOne } from '@/lib/mysql/server';
import { notFound } from 'next/navigation';
import { resolveCurrentActor } from '@/lib/auth/actor';
import { requireProjectEdit } from '@/lib/auth/access';
import LogicBlockTester from '@/components/test/LogicBlockTester';

interface TestPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function TestPage({ params }: TestPageProps) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { projectId } = await params;
  const actor = await resolveCurrentActor();
  try {
    await requireProjectEdit(actor, projectId);
  } catch {
    notFound();
  }

  // Fetch project
  const project = await queryOne<{
    id: string;
    title: string;
  }>('SELECT * FROM projects WHERE id = ?', [projectId]);

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Project Not Found</h1>
        </div>
      </div>
    );
  }

  // Fetch game objects
  const scenes = await query<{ id: string }>(
    'SELECT id FROM scenes WHERE project_id = ?',
    [projectId]
  );
  const sceneIds = scenes.map((s) => s.id);

  const gameObjects = sceneIds.length > 0
    ? await query<{
        id: string;
        name: string;
        type: string;
        has_physics: boolean;
      }>(
        `SELECT id, name, type, has_physics FROM game_objects WHERE scene_id IN (${sceneIds.map(() => '?').join(',')})`,
        sceneIds
      )
    : [];

  // Fetch logic blocks
  const gameObjectIds = gameObjects.map((go) => go.id);
  const logicBlocks = gameObjectIds.length > 0
    ? await query<{
        id: string;
        game_object_id: string | null;
        block_type: string;
        category: string;
        order_index: number;
        block_data: any;
      }>(
        `SELECT * FROM logic_blocks WHERE game_object_id IN (${gameObjectIds.map(() => '?').join(',')}) ORDER BY game_object_id, order_index`,
        gameObjectIds
      )
    : [];

  // Structure data
  const testData = {
    project: {
      id: project.id,
      title: project.title,
    },
    gameObjects: gameObjects.map((go) => ({
      ...go,
      logic_blocks: logicBlocks.filter((lb) => lb.game_object_id === go.id),
    })),
    allLogicBlocks: logicBlocks.map((block) => {
      const gameObject = gameObjects.find((go) => go.id === block.game_object_id);
      const blockData = typeof block.block_data === 'string'
        ? JSON.parse(block.block_data || '{}')
        : (block.block_data || {});

      return {
        ...block,
        game_object_name: gameObject?.name || 'Unknown',
        block_data: blockData,
      };
    }),
  };

  return <LogicBlockTester projectId={projectId} data={testData} />;
}
