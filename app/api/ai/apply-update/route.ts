import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectEdit } from '@/lib/auth/access';
import { query } from '@/lib/mysql/server';
import { readFeatureFlag } from '@/lib/safety/featureFlags';
import { translateAiUpdate, AiUpdateTranslationError } from '@/lib/ai/updateTranslation';
import { executeProjectCommand, CommandServiceError } from '@/lib/projects/commandService';
import { CommandErrorCodes } from '@/lib/projects/commandSchema';
import { toCommandActor } from '@/lib/projects/commandRouteHelper';

interface SceneRow {
  id: string;
  name: string;
}

interface ObjectRow {
  id: string;
  scene_id: string;
  name: string;
}

interface LogicBlockRow {
  id: string;
  game_object_id: string;
  block_type: string;
  category: string;
  parent_block_id: string | null;
  order_index: number;
  block_data: unknown;
}

async function loadProjectGraph(projectId: string) {
  const scenes = await query<SceneRow>(
    'SELECT id, name FROM scenes WHERE project_id = ? ORDER BY order_index, id',
    [projectId],
  );
  if (scenes.length === 0) return { scenes: [] };

  const sceneIds = scenes.map((scene) => scene.id);
  const placeholders = sceneIds.map(() => '?').join(',');
  const objects = await query<ObjectRow>(
    `SELECT id, scene_id, name FROM game_objects WHERE scene_id IN (${placeholders}) ORDER BY order_index, id`,
    sceneIds,
  );
  const objectIds = objects.map((object) => object.id);
  const logicBlocks = objectIds.length === 0
    ? []
    : await query<LogicBlockRow>(
      `SELECT id, game_object_id, block_type, category, parent_block_id, order_index, block_data
         FROM logic_blocks WHERE game_object_id IN (${objectIds.map(() => '?').join(',')})
         ORDER BY game_object_id, order_index, id`,
      objectIds,
    );

  return {
    scenes: scenes.map((scene) => ({
      ...scene,
      game_objects: objects
        .filter((object) => object.scene_id === scene.id)
        .map((object) => ({
          ...object,
          logic_blocks: logicBlocks.filter((block) => block.game_object_id === object.id),
        })),
    })),
  };
}

/**
 * Applies one AI change through the regular project command service.
 *
 * The retired version of this route made unguarded, ad-hoc writes directly
 * into game tables. This replacement performs no writes itself: it resolves
 * the actor, checks edit access, converts a limited AI update into exactly one
 * ProjectCommand, then hands the caller's revision/idempotency envelope to
 * the command service.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = body?.projectId;
    if (typeof projectId !== 'string' || projectId.length === 0 || !body?.update) {
      return NextResponse.json({ error: 'Project ID and update required' }, { status: 400 });
    }

    const actor = await resolveActor(request);
    const authorized = await requireProjectEdit(actor, projectId);

    const flag = readFeatureFlag('creation_ai');
    if (!flag.enabled) {
      return NextResponse.json(
        { error: 'feature_unavailable', reason: flag.reason },
        { status: 503 },
      );
    }

    const graph = await loadProjectGraph(authorized.project.id);
    const commands = translateAiUpdate(body.update, graph);
    // `translateAiUpdate` intentionally produces exactly one command. This
    // keeps an invalid AI batch from leaving a partially updated game.
    const result = await executeProjectCommand({
      actor: toCommandActor(actor),
      projectId: authorized.project.id,
      envelope: {
        expectedRevision: body.expectedRevision,
        idempotencyKey: body.idempotencyKey,
        editingSessionId: body.editingSessionId,
        groupId: body.groupId,
        command: commands[0],
      },
    });

    return NextResponse.json({
      success: true,
      commandId: result.commandId,
      revision: result.revision,
      result: result.result,
      replayed: result.replayed,
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    if (error instanceof AiUpdateTranslationError) {
      const status = error.code === 'scene_not_found' || error.code === 'target_not_found'
        ? 404
        : error.code === 'ambiguous_target'
          ? 409
          : 422;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    if (error instanceof CommandServiceError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          ...(error.code === CommandErrorCodes.RevisionConflict &&
          error.attributes?.currentRevision !== undefined
            ? { currentRevision: error.attributes.currentRevision }
            : {}),
        },
        { status: error.httpStatus },
      );
    }
    console.error('[ai/apply-update] unexpected error:', error);
    return NextResponse.json({ error: 'ai_update_failed' }, { status: 500 });
  }
}
