import { NextRequest, NextResponse } from 'next/server';
import { askAI } from '@/lib/ai/claude';
import { resolveActor } from '@/lib/auth/actor';
import { readFeatureFlag } from '@/lib/safety/featureFlags';
import { rateLimit } from '@/lib/safety/rateLimit';
import { moderateText } from '@/lib/safety/moderation';

// Short single-turn AI call used at runtime by the ask_ai / ai_decide blocks.
// Deliberately playable by anyone — the runtime fires these mid-game from a
// published world, so requiring project edit here would break the game for
// every player who is not its author. That is why this route is `actorOnly`
// rather than access-guarded.
//
// "Playable by anyone" is not the same as "unlimited by anyone", which is what
// it used to be: no flag, and a limit that existed only on `translate`. It now
// resolves an actor so the per-hour budget is keyed on an identity rather than
// a forgeable forwarded IP, and sits behind the same `creation_ai` kill switch
// as every other model call. Anonymous callers share one bucket, which is the
// honest thing to do when there is nothing better to key on.
const ASK_LIMIT_PER_HOUR = 120;

export async function POST(request: NextRequest) {
  try {
    const { prompt, choices } = await request.json();
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ answer: '' });
    }
    const trimmed = prompt.trim();

    const actor = await resolveActor(request);
    const userId = actor.kind === 'user' ? actor.userId : null;
    const actorKey = actor.kind === 'anonymous' ? 'anonymous' : actor.profileId;

    const flag = readFeatureFlag('creation_ai');
    if (!flag.enabled) {
      return NextResponse.json({ answer: '', reason: flag.reason });
    }

    const limit = rateLimit(`ai-ask:${actorKey}`, ASK_LIMIT_PER_HOUR, 60 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json({ answer: '', rateLimited: true, retryAfter: limit.retryAfter });
    }

    // Moderation gate on the outgoing prompt. Any block calling ask_ai passes
    // through here, so this catches player-authored strings that reached the
    // block via say/input widgets.
    const moderation = await moderateText(trimmed, userId, null);
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
