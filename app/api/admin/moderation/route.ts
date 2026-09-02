import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * The publish path for ordinary projects.
 *
 * Until this existed nothing anywhere set `is_published = TRUE` or
 * `moderation_status = 'published'` except the example seeder, so Explore was
 * seed-only and every shared link 404'd for the recipient. A child clicking
 * "Share publicly" moves the project to `moderation_pending`; a moderator
 * approves or rejects it here. Approval is what makes it stranger-readable
 * (`lib/auth/projectAccess.ts` requires all three columns).
 *
 * Deliberately a human step rather than auto-approval: text moderation runs
 * on the title and description only, and the game itself can say anything.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    const admin = await requireAdmin(actor);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const pending = await query<any>(
      `SELECT p.id, p.title, p.description, p.genre, p.created_at, p.updated_at,
              author.display_name AS author_name, author.username AS author_username
         FROM projects p
         LEFT JOIN profiles author ON author.id = p.owner_id
        WHERE p.visibility = 'public' AND p.moderation_status = 'moderation_pending'
        ORDER BY p.updated_at ASC
        LIMIT 100`,
    );
    return NextResponse.json({ pending });
  } catch (error) {
    console.error('Error listing the moderation queue:', error);
    return NextResponse.json({ error: 'Failed to list the queue' }, { status: 500 });
  }
}

/** Approve (publish) or reject one project awaiting review. */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    const admin = await requireAdmin(actor);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { projectId, action, notes } = await request.json();
    if (typeof projectId !== 'string' || !projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
    }
    const note = typeof notes === 'string' ? notes.substring(0, 1000) : null;

    // Locked so two moderators acting at once cannot both "approve" a project
    // that one of them has just rejected; the second sees the new state.
    const outcome = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT id, visibility, moderation_status FROM projects WHERE id = ? FOR UPDATE',
        [projectId],
      );
      const project = (rows as Array<{ id: string; visibility: string; moderation_status: string }>)[0];
      if (!project) return { kind: 'not_found' as const };
      if (project.visibility !== 'public' || project.moderation_status !== 'moderation_pending') {
        return { kind: 'not_pending' as const, status: project.moderation_status };
      }

      if (action === 'approve') {
        await connection.execute(
          `UPDATE projects
              SET is_published = TRUE, moderation_status = 'published', moderation_notes = ?
            WHERE id = ?`,
          [note, projectId],
        );
      } else {
        await connection.execute(
          `UPDATE projects
              SET is_published = FALSE, moderation_status = 'rejected', moderation_notes = ?
            WHERE id = ?`,
          [note, projectId],
        );
      }
      return { kind: 'done' as const };
    });

    if (outcome.kind === 'not_found') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (outcome.kind === 'not_pending') {
      return NextResponse.json(
        { error: 'not_pending', message: `Project is ${outcome.status}, not awaiting review` },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true, moderationStatus: action === 'approve' ? 'published' : 'rejected' });
  } catch (error) {
    console.error('Error deciding a moderation item:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}
