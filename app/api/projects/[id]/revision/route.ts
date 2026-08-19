import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectView } from '@/lib/auth/access';

/**
 * Cheap `GET revision` endpoint.
 *
 * The editor's `commandWrite` helper hits this after a 409
 * `revision_conflict` to re-seed its local revision ref and retry
 * once — reading the whole project graph just to learn a single
 * integer is wasteful for that path.
 *
 * View permission is enough: knowing the current revision leaks no
 * more than knowing the project is being edited.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await resolveActor(request);
    await requireProjectView(actor, id);

    const row = await queryOne<{ revision: number | string }>(
      'SELECT revision FROM projects WHERE id = ?',
      [id],
    );
    if (!row) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ revision: Number(row.revision) });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Error reading revision:', error);
    return NextResponse.json({ error: 'Failed to read revision' }, { status: 500 });
  }
}
