import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireResourceEdit } from '@/lib/auth/access';
import { sanitizeUserInput } from '@/lib/safety/moderation';
import { dispatchCompatCommand, toCommandActor } from '@/lib/projects/commandRouteHelper';

/**
 * Scene update / delete.
 *
 * Migrated in Task 4. Raw SQL against `scenes` is gone; both writes flow
 * through the command service. `Idempotency-Key` + `If-Match: "<revision>"`
 * are required — missing preconditions return 428.
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authorized = await requireResourceEdit(actor, 'scene', id);

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.name === 'string') updates.name = sanitizeUserInput(body.name).substring(0, 120);
    if (typeof body.background_color === 'string') updates.backgroundColor = body.background_color;
    if (body.background_image_url === null || typeof body.background_image_url === 'string') {
      updates.backgroundImageUrl = body.background_image_url;
    }
    if (body.lighting_preset === null || typeof body.lighting_preset === 'string') {
      updates.lightingPreset = body.lighting_preset;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    return dispatchCompatCommand({
      request,
      actor: toCommandActor(actor),
      projectId: authorized.project.id,
      command: { type: 'scene.update', sceneId: id, ...updates } as any,
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Scene not found' }, { status: error.status });
    }
    console.error('Error updating scene:', error);
    return NextResponse.json({ error: 'Failed to update scene' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authorized = await requireResourceEdit(actor, 'scene', id);

    return dispatchCompatCommand({
      request,
      actor: toCommandActor(actor),
      projectId: authorized.project.id,
      command: { type: 'scene.delete', sceneId: id },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Scene not found' }, { status: error.status });
    }
    console.error('Error deleting scene:', error);
    return NextResponse.json({ error: 'Failed to delete scene' }, { status: 500 });
  }
}
