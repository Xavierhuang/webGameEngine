import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, query, queryOne } from '@/lib/mysql/server';
import { chatWithAI } from '@/lib/ai/claude';
import { moderateText } from '@/lib/safety/moderation';

export async function POST(request: NextRequest) {
  try {
    // Allow both authenticated and guest users
    const user = await getAuthenticatedUser();
    const userId = user?.id || 'guest';

    const { projectId, message, history = [] } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    // Get user profile for age (or use default for guests)
    let age = 10;
    if (user) {
      const profile = await queryOne<{ age: number | null }>(
        'SELECT age FROM profiles WHERE user_id = ?',
        [user.id]
      );
      age = profile?.age || 10;
    }

    // Moderate the message for BOTH authenticated users and guests. Guests
    // previously bypassed moderation entirely, which is exactly the "logged
    // but not enforced" pattern we're fixing in Phase 6a.
    if (typeof message === 'string' && message.trim() !== '') {
      const moderation = await moderateText(message, user?.id ?? null, null);
      if (!moderation.safe) {
        return NextResponse.json({
          message: "Oops! Let's try to use different words. Can you ask in another way?",
          moderation: { categories: moderation.categories, reason: moderation.reason },
        });
      }
    }

    // Get current project context
    const project = await queryOne<{
      id: string;
      title: string;
      description: string | null;
    }>('SELECT id, title, description FROM projects WHERE id = ?', [projectId]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get scenes and game objects for context
    const scenes = await query<{
      id: string;
      name: string;
      background_color: string;
    }>('SELECT id, name, background_color FROM scenes WHERE project_id = ?', [projectId]);

    const sceneIds = scenes.map((s) => s.id);
    const gameObjects = sceneIds.length > 0
      ? await query<{
          id: string;
          scene_id: string;
          type: string;
          name: string;
          position_x: number;
          position_y: number;
        }>(
          `SELECT id, scene_id, type, name, position_x, position_y 
           FROM game_objects 
           WHERE scene_id IN (${sceneIds.map(() => '?').join(',')})`,
          sceneIds
        )
      : [];

    const logicBlocks = await query<{
      id: string;
      game_object_id: string | null;
      block_type: string;
      category: string;
    }>('SELECT id, game_object_id, block_type, category FROM logic_blocks WHERE project_id = ? LIMIT 50', [projectId]);

    // Build project context for AI
    const projectContext = {
      title: project.title,
      description: project.description,
      scenes: scenes.map((scene) => ({
        id: scene.id,
        name: scene.name,
        background_color: scene.background_color,
        game_objects: gameObjects
          .filter((go) => go.scene_id === scene.id)
          .map((go) => ({
            id: go.id,
            type: go.type,
            name: go.name,
            position: { x: go.position_x, y: go.position_y },
            logic_blocks: logicBlocks.filter((lb) => lb.game_object_id === go.id),
          })),
      })),
    };

    // Chat with Claude
    const aiResponse = await chatWithAI(
      message,
      history,
      projectContext,
      age
    );

    // Moderate the model's OUTPUT too, not just the child's input. An LLM in
    // the loop on a kids' product means unmoderated model text is a real
    // exposure — this previously went straight to the child.
    const outputCheck = await moderateText(
      [aiResponse.message, ...(aiResponse.suggestions ?? [])].filter(Boolean).join('\n'),
      user?.id ?? null,
      null
    );
    if (!outputCheck.safe) {
      console.warn('[ai/chat] blocked unsafe model output:', outputCheck.reason);
      return NextResponse.json({
        message: "Sorry — I couldn't come up with a good answer for that one. Want to try asking a different way?",
        update: null,
        suggestions: [],
      });
    }

    return NextResponse.json({
      message: aiResponse.message,
      update: aiResponse.update,
      suggestions: aiResponse.suggestions,
    });
  } catch (error: any) {
    console.error('AI chat error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process message' },
      { status: 500 }
    );
  }
}


