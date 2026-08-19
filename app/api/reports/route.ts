import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError } from '@/lib/auth/access';
import { ReportSubmissionError } from '@/lib/safety/reportSubmission';
import { submitReport } from '@/lib/safety/reportSubmission.server';

/**
 * POST /api/reports
 *
 * Body: { projectId?: string, profileId?: string, reason: 'inappropriate' | ...,
 *         details?: string }
 * Exactly one of projectId / profileId is required.
 *
 * Signed-in users and secure guests may file reports. Reports go into the `reports`
 * table with status 'open' and are picked up by moderator review flows.
 * Automatic action: if the report content itself contains disallowed language
 * it is refused (reporters cannot use the report field to send abuse of their
 * own).
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    const body = await request.json();
    return NextResponse.json(await submitReport(actor, body));
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    if (error instanceof ReportSubmissionError) {
      const headers = error.status === 429 && error.retryAfter
        ? { 'Retry-After': String(error.retryAfter) }
        : undefined;
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    console.error('Report creation error:', error);
    return NextResponse.json({ error: error?.message ?? 'Failed to file report' }, { status: 500 });
  }
}
