import { randomUUID } from 'crypto';
import { query, queryOne } from '@/lib/mysql/server';
import { requireProjectView } from '@/lib/auth/access';
import { moderateText, sanitizeUserInput } from '@/lib/safety/moderation';
import { rateLimit } from '@/lib/safety/rateLimit';
import {
  createReportSubmissionService,
  type ReportRecord,
} from '@/lib/safety/reportSubmission';

export const submitReport = createReportSubmissionService({
  requireProjectView,
  findProfile: (profileId) => queryOne<{ id: string }>('SELECT id FROM profiles WHERE id = ?', [profileId]),
  // Resolves a release only while it is the current public one, so a report can
  // never be pinned to a withdrawn, taken-down, superseded, or under-review
  // release the reporter could not have seen.
  async findCurrentPublicRelease(releaseId) {
    const row = await queryOne<{ id: string; project_id: string }>(
      `SELECT id, project_id FROM world_releases
        WHERE id = ? AND status = 'published' AND current_public = TRUE`,
      [releaseId],
    );
    return row ? { id: row.id, projectId: row.project_id } : null;
  },
  moderate: moderateText,
  sanitize: sanitizeUserInput,
  rateLimit,
  createId: randomUUID,
  async insert(record: ReportRecord) {
    await query(
      `INSERT INTO reports
       (id, reporter_profile_id, reported_project_id, reported_profile_id, world_release_id, reason, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.reporterProfileId,
        record.reportedProjectId,
        record.reportedProfileId,
        record.worldReleaseId,
        record.reason,
        record.details,
      ]
    );
  },
}).submit;
