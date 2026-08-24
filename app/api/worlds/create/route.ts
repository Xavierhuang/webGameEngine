import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { createWorldFromTemplate, isWorldTemplateActive, WorldTemplateCreationError } from '@/lib/worlds/templateService';

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid world request' }, { status: 422 });
    }
    const candidate = body as Record<string, unknown>;
    const allowedFields = new Set(['templateId', 'templateVersion', 'title', 'description']);
    if (
      Object.keys(candidate).some((key) => !allowedFields.has(key))
      ||
      typeof candidate.templateId !== 'string'
      || typeof candidate.templateVersion !== 'number'
      || !Number.isInteger(candidate.templateVersion)
      || candidate.templateVersion <= 0
      || typeof candidate.title !== 'string'
      || (candidate.description !== undefined && typeof candidate.description !== 'string')
    ) {
      return NextResponse.json({ error: 'Invalid world request' }, { status: 422 });
    }
    if (!isWorldTemplateActive(candidate.templateId, candidate.templateVersion)) {
      return NextResponse.json({ error: 'Unknown template' }, { status: 422 });
    }
    const created = await createWorldFromTemplate({
      actor,
      templateId: candidate.templateId,
      templateVersion: candidate.templateVersion,
      title: candidate.title,
      description: candidate.description,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof WorldTemplateCreationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error creating template world:', error);
    return NextResponse.json({ error: 'Failed to create world' }, { status: 500 });
  }
}
