import { NextRequest, NextResponse } from 'next/server';
import { createTextTo3DTask } from '@/lib/ai/meshy';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    if (!process.env.MESHY_API_KEY) {
      return NextResponse.json({ ok: false, error: 'MESHY_API_KEY not set' }, { status: 400 });
    }
    const effectivePrompt = prompt || 'simple low-poly blue cube character';
    const { taskId, raw } = await createTextTo3DTask(effectivePrompt);
    return NextResponse.json({ ok: true, taskId, raw });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}


