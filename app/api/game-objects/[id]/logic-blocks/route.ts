import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireResourceEdit } from '@/lib/auth/access';

const HATS = new Set(['on_start', 'on_key_press', 'when_clicked', 'when_touches', 'when_receive', 'when_clone_start', 'define_custom_block']);

function categoryFor(blockType: string): string {
  if (HATS.has(blockType)) return 'event';
  if (['set_variable', 'change_variable', 'show_variable', 'hide_variable', 'add_to_list', 'delete_from_list', 'insert_into_list', 'replace_in_list'].includes(blockType)) return 'data';
  if (['if_then', 'repeat', 'repeat_until', 'forever', 'wait', 'wait_until', 'stop'].includes(blockType)) return 'control';
  if (['move', 'jump', 'rotate', 'scale'].includes(blockType)) return 'movement';
  if (['play_sound'].includes(blockType)) return 'sound';
  return 'general';
}

function serializeBlockData(block: any): string {
  const data: Record<string, any> = {};
  if (block.inputs !== undefined) data.inputs = block.inputs;
  if (block.children !== undefined) data.children = block.children;
  if (block.elseChildren !== undefined) data.elseChildren = block.elseChildren;
  return JSON.stringify(data);
}

/** Replace all logic blocks for a game object (Blockly editor save path). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    const authorized = await requireResourceEdit(actor, 'object', id);
    const body = await request.json();
    const blocks = body.blocks;

    if (!Array.isArray(blocks)) {
      return NextResponse.json({ error: 'blocks array required' }, { status: 400 });
    }

    await query('DELETE FROM logic_blocks WHERE game_object_id = ?', [id]);

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block?.block_type) continue;
      await query(
        `INSERT INTO logic_blocks
         (id, game_object_id, project_id, block_type, category, order_index, block_data)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          id,
          authorized.project.id,
          block.block_type,
          block.category || categoryFor(block.block_type),
          i,
          serializeBlockData(block),
        ]
      );
    }

    return NextResponse.json({ success: true, count: blocks.length });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Game object not found' }, { status: error.status });
    }
    console.error('Error saving logic blocks:', error);
    return NextResponse.json({ error: 'Failed to save logic blocks' }, { status: 500 });
  }
}
