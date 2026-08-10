import { NextRequest, NextResponse } from 'next/server';
import { askAI } from '@/lib/ai/claude';

// Short single-turn AI call used at runtime by the ask_ai / ai_decide blocks.
// Kept intentionally lightweight (no auth, no history, no project context) —
// the runtime fires these mid-game and needs low latency.
export async function POST(request: NextRequest) {
  try {
    const { prompt, choices } = await request.json();
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ answer: '' });
    }
    const constrained = Array.isArray(choices)
      ? choices.map(String).filter((s) => s.trim() !== '')
      : undefined;
    const answer = await askAI(prompt.trim(), constrained);
    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('AI ask error:', error);
    return NextResponse.json({ answer: '', error: error?.message ?? 'ask failed' }, { status: 200 });
  }
}
