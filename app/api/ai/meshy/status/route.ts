import { NextRequest, NextResponse } from 'next/server';
import { getTaskStatus } from '@/lib/ai/meshy';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId') || '';
    if (!taskId) {
      return NextResponse.json({ ok: false, error: 'taskId is required' }, { status: 400 });
    }
    const status = await getTaskStatus(taskId);
    return NextResponse.json({ ok: true, ...status });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}


