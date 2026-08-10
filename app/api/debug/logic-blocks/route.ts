import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, query } from '@/lib/mysql/server';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    // Fetch all logic blocks for this project
    const logicBlocks = await query<{
      id: string;
      game_object_id: string | null;
      project_id: string | null;
      block_type: string;
      category: string;
      order_index: number;
      block_data: any;
      created_at: Date;
    }>(
      'SELECT * FROM logic_blocks WHERE project_id = ? ORDER BY game_object_id, order_index',
      [projectId]
    );

    // Fetch game objects to get their names
    const gameObjects = await query<{
      id: string;
      name: string;
      type: string;
    }>(
      'SELECT id, name, type FROM game_objects WHERE scene_id IN (SELECT id FROM scenes WHERE project_id = ?)',
      [projectId]
    );

    // Structure the response
    const result = logicBlocks.map((block) => {
      const gameObject = gameObjects.find((go) => go.id === block.game_object_id);
      const blockData = typeof block.block_data === 'string'
        ? JSON.parse(block.block_data || '{}')
        : (block.block_data || {});

      return {
        id: block.id,
        game_object_id: block.game_object_id,
        game_object_name: gameObject?.name || 'Unknown',
        game_object_type: gameObject?.type || 'Unknown',
        block_type: block.block_type,
        category: block.category,
        order_index: block.order_index,
        block_data: blockData,
        created_at: block.created_at,
      };
    });

    return NextResponse.json({
      projectId,
      total_blocks: result.length,
      logic_blocks: result,
      by_game_object: result.reduce((acc: any, block) => {
        const objId = block.game_object_id || 'none';
        if (!acc[objId]) {
          acc[objId] = {
            game_object_name: block.game_object_name,
            game_object_type: block.game_object_type,
            blocks: [],
          };
        }
        acc[objId].blocks.push(block);
        return acc;
      }, {}),
    });
  } catch (error: any) {
    console.error('Error fetching logic blocks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch logic blocks' },
      { status: 500 }
    );
  }
}

