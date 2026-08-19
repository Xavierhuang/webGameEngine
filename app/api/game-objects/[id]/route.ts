import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireResourceEdit, requireResourceView } from '@/lib/auth/access';
import { dispatchCompatCommand, toCommandActor } from '@/lib/projects/commandRouteHelper';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    await requireResourceView(actor, 'object', id);

    const gameObject = await queryOne<any>(
      `SELECT id, scene_id, type, name, position_x, position_y, position_z,
              rotation, scale_x, scale_y, sprite_url, color, width, height,
              has_physics, is_static, mass, properties
         FROM game_objects WHERE id = ?`,
      [id]
    );

    if (!gameObject) {
      return NextResponse.json({ error: 'Game object not found' }, { status: 404 });
    }
    return NextResponse.json(gameObject);
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Game object not found' }, { status: error.status });
    }
    console.error('Error fetching game object:', error);
    return NextResponse.json({ error: 'Failed to fetch game object' }, { status: 500 });
  }
}

/**
 * PATCH/DELETE migrated in Task 4. Raw SQL against `game_objects` is gone;
 * both writes flow through the command service. Preconditions
 * (`Idempotency-Key`, `If-Match: "<revision>"`) are required — missing
 * returns 428.
 *
 * Backward-compat note: the previous PATCH accepted flat DB columns
 * (`position_x`, `has_physics`, etc.); the new schema takes structured
 * properties. The route translates the legacy flat body into the strict
 * `ObjectProperties` shape before dispatching.
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
    const authorized = await requireResourceEdit(actor, 'object', id);
    const updates = await request.json();

    const command: Record<string, any> = { type: 'object.update', objectId: id };
    const properties: Record<string, any> = {};

    if (typeof updates.name === 'string') command.name = updates.name;
    if (
      typeof updates.position_x === 'number' ||
      typeof updates.position_y === 'number' ||
      typeof updates.position_z === 'number'
    ) {
      properties.position = {
        x: Number(updates.position_x ?? 0),
        y: Number(updates.position_y ?? 0),
        z: Number(updates.position_z ?? 0),
      };
    }
    if (typeof updates.scale_x === 'number' || typeof updates.scale_y === 'number') {
      properties.scale = {
        x: Number(updates.scale_x ?? 1),
        y: Number(updates.scale_y ?? 1),
        z: 1,
      };
    }
    if (typeof updates.color === 'string') properties.color = updates.color;
    if (typeof updates.mass === 'number') properties.mass = updates.mass;
    // The legacy shape column was implicit — the client sent `shape` inside
    // `properties`. Pass any structured `properties` object through as-is
    // so the handler receives the same tree.
    if (updates.properties && typeof updates.properties === 'object') {
      Object.assign(properties, updates.properties);
    }

    if (Object.keys(properties).length > 0) command.properties = properties;

    if (command.name === undefined && command.properties === undefined) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    return dispatchCompatCommand({
      request,
      actor: toCommandActor(actor),
      projectId: authorized.project.id,
      command: command as any,
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Game object not found' }, { status: error.status });
    }
    console.error('Error updating game object:', error);
    return NextResponse.json({ error: 'Failed to update game object' }, { status: 500 });
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
    const authorized = await requireResourceEdit(actor, 'object', id);

    return dispatchCompatCommand({
      request,
      actor: toCommandActor(actor),
      projectId: authorized.project.id,
      command: { type: 'object.delete', objectId: id },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Game object not found' }, { status: error.status });
    }
    console.error('Error deleting game object:', error);
    return NextResponse.json({ error: 'Failed to delete game object' }, { status: 500 });
  }
}
