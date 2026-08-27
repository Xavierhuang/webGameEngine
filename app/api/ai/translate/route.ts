import { NextRequest, NextResponse } from 'next/server';
import { askAI } from '@/lib/ai/claude';
import { resolveActor } from '@/lib/auth/actor';
import { readFeatureFlag } from '@/lib/safety/featureFlags';
import { moderateText } from '@/lib/safety/moderation';
import { rateLimit } from '@/lib/safety/rateLimit';
import { TRANSLATE_PROMPT_NAMES, isSupportedLanguage } from '@/lib/i18n/languages';

/**
 * Translate text for the `translate` block.
 *
 * Scratch's Translate extension is one of the six; this is the equivalent,
 * backed by the same model the other AI blocks use rather than a separate
 * translation service.
 *
 * Both the input and the output are moderated: this runs inside published
 * games, so a player's typed answer can reach it, and the model's reply is
 * rendered straight back to a child.
 *
 * Like `ask`, this is `actorOnly` on purpose — it runs mid-game for players
 * who do not own the world. Trust-boundary Task 7 changed two things: the
 * limit is now keyed on a resolved actor instead of `clientKey`, which derives
 * from `x-forwarded-for` and is forgeable by the caller (a limit anyone can
 * reset is not a limit); and the route now honours the `creation_ai` kill
 * switch, so disabling AI actually disables all of it.
 */
const TRANSLATE_LIMIT_PER_HOUR = 120;

export async function POST(request: NextRequest) {
  try {
    const { text, language } = await request.json();

    const source = typeof text === 'string' ? text.trim().substring(0, 500) : '';
    if (!source) return NextResponse.json({ text: '' });

    const actor = await resolveActor(request);
    const userId = actor.kind === 'user' ? actor.userId : null;
    const actorKey = actor.kind === 'anonymous' ? 'anonymous' : actor.profileId;

    // Language validation reads a module constant and is side-effect free, but
    // it runs after the actor anyway: the trust-boundary AST guard treats any
    // non-allowlisted import called before authorization as privileged, and
    // widening that allowlist to keep an ordering convenience is how the
    // allowlist stops meaning anything.
    const code = typeof language === 'string' ? language.trim().toLowerCase() : 'en';
    const target = TRANSLATE_PROMPT_NAMES[code];
    if (!isSupportedLanguage(code) || !target) {
      return NextResponse.json({ text: '', error: `Unknown language: ${code}` }, { status: 400 });
    }

    const flag = readFeatureFlag('creation_ai');
    if (!flag.enabled) {
      return NextResponse.json({ text: '', reason: flag.reason });
    }

    const limit = rateLimit(`ai-translate:${actorKey}`, TRANSLATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { text: '', error: 'Too many translations. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      );
    }

    const inbound = await moderateText(source, userId, null);
    if (!inbound.safe) return NextResponse.json({ text: '' });

    // Constrained prompt: the model must return only the translation, or the
    // block would render commentary into the game.
    const answer = await askAI(
      `Translate the following text into ${target}. Reply with ONLY the translation, ` +
      `no quotes, no explanation, no original text.\n\n${source}`
    );

    const translated = String(answer ?? '').trim();
    if (!translated) return NextResponse.json({ text: '' });

    const outbound = await moderateText(translated, userId, null);
    if (!outbound.safe) {
      console.warn('[ai/translate] blocked unsafe output');
      return NextResponse.json({ text: '' });
    }

    return NextResponse.json({ text: translated });
  } catch (error: any) {
    console.error('Translate error:', error);
    // Return empty rather than an error status: a failed translation should
    // leave the game running, not break the script.
    return NextResponse.json({ text: '' });
  }
}
