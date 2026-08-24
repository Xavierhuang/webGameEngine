import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError } from '@/lib/auth/access';
import { MissionServiceError, startWorldMissionSession } from '@/lib/worlds/missionService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof (body as { snapshotId?: unknown }).snapshotId !== 'string') {
      return NextResponse.json({ error: 'invalid_mission_action' }, { status: 422 });
    }
    const session = await startWorldMissionSession({ actor, projectId: id, snapshotId: (body as { snapshotId: string }).snapshotId });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    if (error instanceof MissionServiceError) return NextResponse.json({ error: error.code }, { status: error.status });
    console.error('[world-mission-session] start failed:', error);
    return NextResponse.json({ error: 'mission_session_failed' }, { status: 500 });
  }
}
