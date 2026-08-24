import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { listWorldTemplateDtos } from '@/lib/worlds/templateService';

export async function GET(request: NextRequest) {
  const actor = await resolveActor(request);
  if (actor.kind === 'anonymous') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ templates: listWorldTemplateDtos() });
}
