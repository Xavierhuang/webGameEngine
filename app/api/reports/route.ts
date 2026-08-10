import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAuthenticatedUser, query, queryOne } from '@/lib/mysql/server';
import { moderateText, sanitizeUserInput } from '@/lib/safety/moderation';

const ALLOWED_REASONS = new Set(['inappropriate', 'harassment', 'spam', 'violence', 'other']);

/**
 * POST /api/reports
 *
 * Body: { projectId?: string, profileId?: string, reason: 'inappropriate' | ...,
 *         details?: string }
 * At least one of projectId / profileId is required.
 *
 * Guests may file reports too (no auth required). Reports go into the `reports`
 * table with status 'open' and are picked up by moderator review flows.
 * Automatic action: if the report content itself contains disallowed language
 * it is refused (reporters cannot use the report field to send abuse of their
 * own).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = typeof body.projectId === 'string' ? body.projectId : null;
    const reportedProfileId = typeof body.profileId === 'string' ? body.profileId : null;
    const reason = typeof body.reason === 'string' && ALLOWED_REASONS.has(body.reason) ? body.reason : 'other';
    const details = typeof body.details === 'string' ? sanitizeUserInput(body.details).substring(0, 1000) : '';

    if (!projectId && !reportedProfileId) {
      return NextResponse.json({ error: 'Must report a project or a profile' }, { status: 400 });
    }

    // Verify the reported entity exists (avoids junk rows and helps rate limits).
    if (projectId) {
      const p = await queryOne<{ id: string }>('SELECT id FROM projects WHERE id = ?', [projectId]);
      if (!p) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (reportedProfileId) {
      const p = await queryOne<{ id: string }>('SELECT id FROM profiles WHERE id = ?', [reportedProfileId]);
      if (!p) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Report details go through the same moderation gate — a report field is
    // not a bypass channel for slurs. Empty details skip the check.
    if (details) {
      const user = await getAuthenticatedUser();
      const modResult = await moderateText(details, user?.id ?? null, null);
      if (!modResult.safe) {
        return NextResponse.json(
          { error: 'Report details failed moderation', reason: modResult.reason },
          { status: 422 }
        );
      }
    }

    // Resolve reporter profile id (null for anonymous guests).
    const user = await getAuthenticatedUser();
    let reporterProfileId: string | null = null;
    if (user) {
      const profile = await queryOne<{ id: string }>(
        'SELECT id FROM profiles WHERE user_id = ?',
        [user.id]
      );
      reporterProfileId = profile?.id ?? null;
    }

    const id = randomUUID();
    await query(
      `INSERT INTO reports
       (id, reporter_profile_id, reported_project_id, reported_profile_id, reason, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, reporterProfileId, projectId, reportedProfileId, reason, details || null]
    );

    return NextResponse.json({ id, status: 'open' });
  } catch (error: any) {
    console.error('Report creation error:', error);
    return NextResponse.json({ error: error?.message ?? 'Failed to file report' }, { status: 500 });
  }
}
