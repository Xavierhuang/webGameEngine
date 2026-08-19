import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectView } from '@/lib/auth/access';

/**
 * Toggle a "love-it" on a project.
 *
 * `projects.like_count` existed as a bare counter with no record of who liked
 * what, so it could never be un-liked or de-duplicated. `project_likes` is now
 * the source of truth and the counter is a cache recomputed from it.
 *
 * Wrapped in `withTransaction` in Task 4: the toggle + counter recompute are
 * a single logical operation and must not diverge if either query fails.
 * Counter cache write does not need a revision fence, so this route stays
 * on the write-boundary allowlist with a `counter_cache` reason.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requireProjectView(actor, id);

    const outcome = await withTransaction(async (connection) => {
      const [existingRows] = await connection.execute(
        'SELECT project_id FROM project_likes WHERE project_id = ? AND profile_id = ? FOR UPDATE',
        [id, actor.profileId],
      );
      const existing = (existingRows as Array<{ project_id: string }>)[0];

      if (existing) {
        await connection.execute(
          'DELETE FROM project_likes WHERE project_id = ? AND profile_id = ?',
          [id, actor.profileId],
        );
      } else {
        await connection.execute(
          'INSERT IGNORE INTO project_likes (project_id, profile_id) VALUES (?, ?)',
          [id, actor.profileId],
        );
      }

      // Recompute rather than increment so the cache cannot drift.
      await connection.execute(
        `UPDATE projects
            SET like_count = (SELECT COUNT(*) FROM project_likes WHERE project_id = ?)
          WHERE id = ?`,
        [id, id],
      );

      const [updatedRows] = await connection.execute(
        'SELECT like_count FROM projects WHERE id = ?',
        [id],
      );
      const updated = (updatedRows as Array<{ like_count: number }>)[0];
      return { liked: !existing, like_count: updated?.like_count ?? 0 };
    });

    return NextResponse.json(outcome);
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Error toggling like:', error);
    return NextResponse.json({ error: 'Failed to toggle like' }, { status: 500 });
  }
}
