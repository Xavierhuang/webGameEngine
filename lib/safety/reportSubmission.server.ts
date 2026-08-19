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
  moderate: moderateText,
  sanitize: sanitizeUserInput,
  rateLimit,
  createId: randomUUID,
  async insert(record: ReportRecord) {
    await query(
      `INSERT INTO reports
       (id, reporter_profile_id, reported_project_id, reported_profile_id, reason, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.reporterProfileId,
        record.reportedProjectId,
        record.reportedProfileId,
        record.reason,
        record.details,
      ]
    );
  },
}).submit;
