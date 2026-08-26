const ALLOWED_REASONS = new Set(['inappropriate', 'harassment', 'spam', 'violence', 'other']);
const REPORT_LIMIT = 5;
const REPORT_WINDOW_MS = 60 * 60 * 1000;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReportInput {
  projectId?: unknown;
  profileId?: unknown;
  reason?: unknown;
  details?: unknown;
  [key: string]: unknown;
}

export interface ReportRecord {
  id: string;
  reporterProfileId: string;
  reportedProjectId: string | null;
  reportedProfileId: string | null;
  /**
   * Set only when the report names a currently public world release that
   * belongs to the reported project. Null for every ordinary project report,
   * which keeps legacy reporting behavior byte-identical.
   */
  worldReleaseId: string | null;
  reason: string;
  details: string | null;
}

interface ReportSubmissionDependencies {
  requireProjectView(actor: ReportActor, projectId: string): Promise<unknown>;
  /**
   * Resolves a release id to its project only while that release is the
   * current public one. Optional so existing callers keep working unchanged;
   * a caller that omits it cannot accept `releaseId` at all.
   */
  findCurrentPublicRelease?(releaseId: string): Promise<{ id: string; projectId: string } | null>;
  findProfile(profileId: string): Promise<{ id: string } | null>;
  moderate(
    text: string,
    userId?: string | null,
    profileId?: string | null
  ): Promise<{ safe: boolean; reason?: string }>;
  sanitize(value: string): string;
  rateLimit(key: string, limit: number, windowMs: number): {
    allowed: boolean;
    retryAfter: number;
    remaining: number;
  };
  createId(): string;
  insert(record: ReportRecord): Promise<void>;
}

export type ReportActor =
  | { kind: 'user'; userId: string; profileId: string }
  | { kind: 'guest'; sessionId: string; profileId: string }
  | { kind: 'anonymous' };

export class ReportSubmissionError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 404 | 422 | 429,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'ReportSubmissionError';
  }
}

function suppliedId(value: unknown): string | null {
  return typeof value === 'string' && CANONICAL_UUID.test(value) ? value : null;
}

function actorLimitKey(actor: Exclude<ReportActor, { kind: 'anonymous' }>): string {
  return actor.kind === 'user'
    ? `report:user:${actor.userId}`
    : `report:guest:${actor.sessionId}`;
}

export function createReportSubmissionService(dependencies: ReportSubmissionDependencies) {
  async function submit(actor: ReportActor, input: ReportInput) {
    const hasProjectId = Object.prototype.hasOwnProperty.call(input, 'projectId');
    const hasProfileId = Object.prototype.hasOwnProperty.call(input, 'profileId');
    const hasReleaseId = Object.prototype.hasOwnProperty.call(input, 'releaseId');
    const projectId = suppliedId(input.projectId);
    const profileId = suppliedId(input.profileId);
    const releaseId = suppliedId(input.releaseId);
    if (hasProjectId === hasProfileId || (hasProjectId && !projectId) || (hasProfileId && !profileId)) {
      throw new ReportSubmissionError('Report exactly one project or profile.', 400);
    }
    // A release report is a project report that additionally names which frozen
    // release the reporter saw. It is never a substitute for the project id, so
    // a moderator always lands on a project even if the release is later gone.
    if (hasReleaseId && (!releaseId || !projectId)) {
      throw new ReportSubmissionError('Report exactly one project or profile.', 400);
    }

    // Anonymous submissions stay disabled until Task 6 installs the shared,
    // persistent MySQL limiter. Never fall back to forwarded-IP authority.
    if (actor.kind === 'anonymous') {
      throw new ReportSubmissionError('Sign in or start a guest session to file a report.', 401);
    }

    const limit = dependencies.rateLimit(actorLimitKey(actor), REPORT_LIMIT, REPORT_WINDOW_MS);
    if (!limit.allowed) {
      throw new ReportSubmissionError('Too many reports. Please try again later.', 429, limit.retryAfter);
    }

    let worldReleaseId: string | null = null;
    if (projectId) {
      if (releaseId) {
        // Accept the release only when it is currently public AND belongs to the
        // reported project. A mismatch is a 404, not a 400: confirming that a
        // release exists but sits under a different project would leak the link
        // between an opaque public slug and a private project id.
        const release = await dependencies.findCurrentPublicRelease?.(releaseId);
        if (!release || release.projectId !== projectId) {
          throw new ReportSubmissionError('Report target not found', 404);
        }
        worldReleaseId = release.id;
      }
      // A current public release IS the viewability proof for this report. The
      // source project stays private, so `requireProjectView` would reject every
      // visitor who can actually play the world — which is precisely the
      // audience release reporting exists for. Anything without a validated
      // release still goes through the ordinary project-view boundary, so this
      // is not a way to report a project you cannot otherwise see.
      if (!worldReleaseId) {
        await dependencies.requireProjectView(actor, projectId);
      }
    } else if (!await dependencies.findProfile(profileId as string)) {
      throw new ReportSubmissionError('Profile not found', 404);
    }

    const reason =
      typeof input.reason === 'string' && ALLOWED_REASONS.has(input.reason)
        ? input.reason
        : 'other';
    const details =
      typeof input.details === 'string'
        ? dependencies.sanitize(input.details).substring(0, 1000)
        : '';

    if (details) {
      const moderation = await dependencies.moderate(
        details,
        actor.kind === 'user' ? actor.userId : null,
        actor.kind === 'guest' ? actor.profileId : null
      );
      if (!moderation.safe) {
        throw new ReportSubmissionError(
          moderation.reason || 'Report details failed moderation',
          422
        );
      }
    }

    const record: ReportRecord = {
      id: dependencies.createId(),
      reporterProfileId: actor.profileId,
      reportedProjectId: projectId,
      reportedProfileId: profileId,
      worldReleaseId,
      reason,
      details: details || null,
    };
    await dependencies.insert(record);
    return { id: record.id, status: 'open' as const };
  }

  return { submit };
}
