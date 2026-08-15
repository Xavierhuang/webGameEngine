import { NextRequest, NextResponse } from 'next/server';
import { askAI } from '@/lib/ai/claude';
import { moderateText } from '@/lib/safety/moderation';
import { rateLimit, clientKey } from '@/lib/safety/rateLimit';
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
 */

export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'translate'), 120, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { text: '', error: 'Too many translations. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const { text, language } = await request.json();

    const source = typeof text === 'string' ? text.trim().substring(0, 500) : '';
    if (!source) return NextResponse.json({ text: '' });

    const code = typeof language === 'string' ? language.trim().toLowerCase() : 'en';
    const target = TRANSLATE_PROMPT_NAMES[code];
    if (!isSupportedLanguage(code) || !target) {
      return NextResponse.json({ text: '', error: `Unknown language: ${code}` }, { status: 400 });
    }

    const inbound = await moderateText(source, null, null);
    if (!inbound.safe) return NextResponse.json({ text: '' });

    // Constrained prompt: the model must return only the translation, or the
    // block would render commentary into the game.
    const answer = await askAI(
      `Translate the following text into ${target}. Reply with ONLY the translation, ` +
      `no quotes, no explanation, no original text.\n\n${source}`
    );

    const translated = String(answer ?? '').trim();
    if (!translated) return NextResponse.json({ text: '' });

    const outbound = await moderateText(translated, null, null);
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
