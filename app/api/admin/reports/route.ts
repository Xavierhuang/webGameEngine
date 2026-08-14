import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, getAuthenticatedUser } from '@/lib/mysql/server';

/**
 * Moderation queue.
 *
 * `reports` and `moderation_events` were both written to and read by nothing:
 * there was no GET handler, no admin surface, and no `role = 'admin'` check
 * anywhere in the codebase. Reports went into a table nobody could see.
 */
async function requireAdmin() {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const profile = await queryOne<{ id: string; role: string }>(
    'SELECT id, role FROM profiles WHERE user_id = ?',
    [user.id]
  );
  return profile?.role === 'admin' ? profile : null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'open';
    const allowed = new Set(['open', 'reviewed', 'dismissed', 'actioned']);

    const reports = await query<any>(
      `SELECT r.id, r.reason, r.details, r.status, r.created_at,
              r.reported_project_id, r.reported_profile_id,
              p.title AS project_title, p.visibility, p.moderation_status,
              reporter.display_name AS reporter_name
       FROM reports r
       LEFT JOIN projects p ON p.id = r.reported_project_id
       LEFT JOIN profiles reporter ON reporter.id = r.reporter_profile_id
       WHERE r.status = ?
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [allowed.has(status) ? status : 'open']
    );

    return NextResponse.json({ reports });
  } catch (error: any) {
    console.error('Error listing reports:', error);
    return NextResponse.json({ error: 'Failed to list reports' }, { status: 500 });
  }
}

/** Act on a report: dismiss it, or take the project down. */
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { reportId, action, notes } = await request.json();
    if (typeof reportId !== 'string' || !reportId) {
      return NextResponse.json({ error: 'reportId required' }, { status: 400 });
    }
    if (action !== 'dismiss' && action !== 'remove') {
      return NextResponse.json({ error: 'action must be dismiss or remove' }, { status: 400 });
    }

    const report = await queryOne<{ id: string; reported_project_id: string | null }>(
      'SELECT id, reported_project_id FROM reports WHERE id = ?',
      [reportId]
    );
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    if (action === 'remove' && report.reported_project_id) {
      // Rejecting also hides it from the gallery: getProjectAccess treats a
      // rejected project as non-public even if visibility still says public.
      await query(
        "UPDATE projects SET moderation_status = 'rejected', moderation_notes = ? WHERE id = ?",
        [typeof notes === 'string' ? notes.substring(0, 1000) : null, report.reported_project_id]
      );
    }

    await query(
      `UPDATE reports
       SET status = ?, reviewer_id = ?, review_notes = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        action === 'remove' ? 'actioned' : 'dismissed',
        admin.id,
        typeof notes === 'string' ? notes.substring(0, 1000) : null,
        reportId,
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error acting on report:', error);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}
