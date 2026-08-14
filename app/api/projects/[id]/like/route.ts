import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/mysql/server';
import { getActorProfileId, getProjectAccess } from '@/lib/auth/access';

/**
 * Toggle a "love-it" on a project.
 *
 * `projects.like_count` existed as a bare counter with no record of who liked
 * what, so it could never be un-liked or de-duplicated. `project_likes` is now
 * the source of truth and the counter is a cache recomputed from it.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const actorProfileId = await getActorProfileId();
    if (!actorProfileId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const project = await queryOne<{
      id: string;
      owner_id: string;
      visibility: string;
      moderation_status: string;
    }>(
      'SELECT id, owner_id, visibility, moderation_status FROM projects WHERE id = ?',
      [id]
    );
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const access = await getProjectAccess(project);
    if (!access.canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const existing = await queryOne<{ project_id: string }>(
      'SELECT project_id FROM project_likes WHERE project_id = ? AND profile_id = ?',
      [id, actorProfileId]
    );

    if (existing) {
      await query('DELETE FROM project_likes WHERE project_id = ? AND profile_id = ?', [
        id,
        actorProfileId,
      ]);
    } else {
      await query(
        'INSERT IGNORE INTO project_likes (project_id, profile_id) VALUES (?, ?)',
        [id, actorProfileId]
      );
    }

    // Recompute rather than increment, so the cache can't drift.
    await query(
      `UPDATE projects
       SET like_count = (SELECT COUNT(*) FROM project_likes WHERE project_id = ?)
       WHERE id = ?`,
      [id, id]
    );

    const updated = await queryOne<{ like_count: number }>(
      'SELECT like_count FROM projects WHERE id = ?',
      [id]
    );

    return NextResponse.json({
      liked: !existing,
      like_count: updated?.like_count ?? 0,
    });
  } catch (error: any) {
    console.error('Error toggling like:', error);
    return NextResponse.json({ error: 'Failed to toggle like' }, { status: 500 });
  }
}
