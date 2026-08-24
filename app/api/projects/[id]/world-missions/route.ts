import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError } from '@/lib/auth/access';
import {
  getMissionProgress,
  MissionServiceError,
  recordWorldMissionAction,
} from '@/lib/worlds/missionService';

function missionErrorResponse(error: unknown) {
  if (error instanceof AccessError) return NextResponse.json({ error: 'Project not found' }, { status: error.status });
  if (error instanceof MissionServiceError) return NextResponse.json({ error: error.code }, { status: error.status });
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ missions: await getMissionProgress({ actor, projectId: id }) });
  } catch (error) {
    const response = missionErrorResponse(error);
    if (response) return response;
    console.error('[world-missions] read failed:', error);
    return NextResponse.json({ error: 'mission_read_failed' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('action' in body)) {
      return NextResponse.json({ error: 'invalid_mission_action' }, { status: 422 });
    }
    const missions = await recordWorldMissionAction({ actor, projectId: id, action: (body as { action: unknown }).action });
    return NextResponse.json({ missions });
  } catch (error) {
    const response = missionErrorResponse(error);
    if (response) return response;
    console.error('[world-missions] write failed:', error);
    return NextResponse.json({ error: 'mission_write_failed' }, { status: 500 });
  }
}
