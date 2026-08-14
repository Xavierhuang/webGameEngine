import { NextRequest, NextResponse } from 'next/server';
import { askAI } from '@/lib/ai/claude';
import { getAuthenticatedUser } from '@/lib/mysql/server';
import { moderateText } from '@/lib/safety/moderation';

// Short single-turn AI call used at runtime by the ask_ai / ai_decide blocks.
// Kept intentionally lightweight (no auth, no history, no project context) —
// the runtime fires these mid-game and needs low latency. Prompts are still
// moderated: this route is reachable from any published game, and the game
// author might feed player input into the ask_ai block.
export async function POST(request: NextRequest) {
  try {
    const { prompt, choices } = await request.json();
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ answer: '' });
    }
    const trimmed = prompt.trim();

    // Moderation gate on the outgoing prompt. Any block calling ask_ai passes
    // through here, so this catches player-authored strings that reached the
    // block via say/input widgets.
    const user = await getAuthenticatedUser();
    const moderation = await moderateText(trimmed, user?.id ?? null, null);
    if (!moderation.safe) {
      return NextResponse.json({
        answer: '',
        blocked: true,
        reason: moderation.reason ?? 'Contains disallowed content',
      });
    }

    const constrained = Array.isArray(choices)
      ? choices.map(String).filter((s) => s.trim() !== '')
      : undefined;
    const answer = await askAI(trimmed, constrained);

    // Moderate the model's output as well as the prompt. This endpoint backs
    // the ask_ai / ai_decide blocks, so its response is rendered straight into
    // a published game that other children play.
    if (answer && String(answer).trim() !== '') {
      const outputCheck = await moderateText(String(answer), null, null);
      if (!outputCheck.safe) {
        console.warn('[ai/ask] blocked unsafe model output:', outputCheck.reason);
        return NextResponse.json({ answer: '' });
      }
    }

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('AI ask error:', error);
    return NextResponse.json({ answer: '', error: error?.message ?? 'ask failed' }, { status: 200 });
  }
}
