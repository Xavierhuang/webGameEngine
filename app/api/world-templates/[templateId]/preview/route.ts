import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { previewWorldTemplate } from '@/lib/worlds/templateService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const actor = await resolveActor(request);
  if (actor.kind === 'anonymous') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { templateId } = await params;
  const rawVersion = request.nextUrl.searchParams.get('version');
  const version = rawVersion ? Number(rawVersion) : NaN;
  if (!Number.isInteger(version) || version <= 0) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 422 });
  }

  const preview = previewWorldTemplate(templateId, version);
  if (!preview) return NextResponse.json({ error: 'Unknown template' }, { status: 404 });
  return NextResponse.json({ preview });
}
