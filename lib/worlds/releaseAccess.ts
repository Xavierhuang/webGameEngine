import { query, queryOne } from '@/lib/mysql/server';
import type { Actor } from '@/lib/auth/actor';
import {
  isPublicWorldRelease,
  ReleaseServiceError,
  type PublicWorldRelease,
  type WorldReleaseStatus,
} from './releaseTypes';

interface PublicWorldReleaseRow {
  id: string;
  slug: string;
  snapshot_title: string;
  snapshot_description: string | null;
  snapshot_thumbnail_url: string | null;
  template_id: string;
  snapshot_genre: string | null;
  creator_label: string;
  published_at: Date | string;
  like_count: number;
  play_count: number;
  remix_count: number;
  status: WorldReleaseStatus;
  current_public: boolean | number;
}

export interface PublicWorldReleaseListOptions {
  page?: number;
  pageSize?: number;
}

const MAX_PUBLIC_WORLD_RELEASE_PAGE_SIZE = 60;
const MAX_PUBLIC_WORLD_RELEASE_PAGE = 10_000;

function isCurrentPublicRow(row: PublicWorldReleaseRow): boolean {
  return isPublicWorldRelease(row.status, row.current_public === true || row.current_public === 1);
}

function normalizeBoundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value === undefined) return fallback;
  return Math.min(Math.max(value, 1), maximum);
}

function normalizeListOptions(options: PublicWorldReleaseListOptions): { limit: number; offset: number } {
  const page = normalizeBoundedInteger(options.page, 1, MAX_PUBLIC_WORLD_RELEASE_PAGE);
  const limit = normalizeBoundedInteger(options.pageSize, 24, MAX_PUBLIC_WORLD_RELEASE_PAGE_SIZE);
  return { limit, offset: (page - 1) * limit };
}

/**
 * MySQL will not accept a bound parameter for LIMIT or OFFSET through the
 * prepared-statement protocol that `query`/`queryOne` use — `LIMIT ?` fails at
 * execute time with ER_WRONG_ARGUMENTS. These clauses therefore have to be
 * inlined, so every value passes through this gate first. Callers must only
 * ever hand it a value they derived and clamped themselves, never raw input.
 */
function boundedLimitClause(value: number, maximum: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`refusing to inline an unbounded SQL row count: ${value}`);
  }
  return String(value);
}

function toPublishedAt(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

/** Explicit allowlist: authority, consent, snapshot, and reviewer fields cannot cross this boundary. */
export function toPublicWorldRelease(row: PublicWorldReleaseRow): PublicWorldRelease {
  return {
    id: row.id,
    slug: row.slug,
    title: row.snapshot_title,
    description: row.snapshot_description,
    thumbnailUrl: row.snapshot_thumbnail_url,
    templateId: row.template_id,
    genre: row.snapshot_genre,
    creatorLabel: row.creator_label,
    publishedAt: toPublishedAt(row.published_at),
    likeCount: row.like_count,
    playCount: row.play_count,
    remixCount: row.remix_count,
  };
}

const PUBLIC_WORLD_RELEASE_SELECT = `
  SELECT wr.id, wr.public_slug AS slug,
         JSON_UNQUOTE(JSON_EXTRACT(snapshot.snapshot_json, '$.project.title')) AS snapshot_title,
         JSON_UNQUOTE(JSON_EXTRACT(snapshot.snapshot_json, '$.project.description')) AS snapshot_description,
         JSON_UNQUOTE(JSON_EXTRACT(snapshot.snapshot_json, '$.project.thumbnail_url')) AS snapshot_thumbnail_url,
         JSON_UNQUOTE(JSON_EXTRACT(snapshot.snapshot_json, '$.project.genre')) AS snapshot_genre,
         wr.template_id, wr.creator_label, wr.published_at,
         p.like_count, p.play_count, p.remix_count,
         wr.status, wr.current_public
    FROM world_releases wr
    JOIN project_play_snapshots snapshot
      ON snapshot.id = wr.project_play_snapshot_id
     AND snapshot.project_id = wr.project_id
    JOIN projects p ON p.id = wr.project_id
`;

/** Resolves one opaque public slug without exposing non-current release history. */
export async function getPublicWorldReleaseBySlug(slug: string): Promise<PublicWorldRelease | null> {
  const publicSlug = slug.trim();
  if (!publicSlug) return null;

  const row = await queryOne<PublicWorldReleaseRow>(
    `${PUBLIC_WORLD_RELEASE_SELECT}
      WHERE wr.public_slug = ?
        AND wr.status = 'published'
        AND wr.current_public = TRUE`,
    [publicSlug],
  );

  return row && isCurrentPublicRow(row) ? toPublicWorldRelease(row) : null;
}

export interface OwnerWorldReleaseCheck {
  name: string;
  status: 'passed' | 'failed' | 'error';
  reasonCode: string | null;
}

export interface OwnerWorldRelease {
  id: string;
  status: WorldReleaseStatus;
  sourceRevision: number;
  submittedAt: string;
  publicSlug: string | null;
  checks: OwnerWorldReleaseCheck[];
}

interface OwnerWorldReleaseRow {
  id: string;
  status: WorldReleaseStatus;
  project_revision: number | string;
  submitted_at: Date | string;
  public_slug: string | null;
}

interface OwnerWorldReleaseCheckRow {
  world_release_id: string;
  check_type: string;
  status: 'passed' | 'failed' | 'error';
  reason_code: string | null;
}

const MAX_OWNER_WORLD_RELEASE_HISTORY = 50;

/**
 * A creator's own release history, for the World Builder release panel.
 *
 * Deliberately absent from the DTO: `decision_reason_code`, reviewer identity,
 * and every decision-table row. Moderator reasons are staff-facing policy codes,
 * and the plan requires the creator surface to render neutral child-safe copy
 * driven by status alone. The fixed automated check codes are safe to return —
 * Task 3 designed them for exactly this — so a creator can see what to fix.
 */
export async function listOwnerWorldReleases(input: {
  actor: Actor;
  projectId: string;
}): Promise<OwnerWorldRelease[]> {
  const { actor, projectId } = input;
  // A guest or anonymous caller owns nothing; fail closed with the same
  // non-disclosing code a stranger gets so ownership is never probeable.
  if (actor.kind !== 'user') throw new ReleaseServiceError('release_not_found', 404);

  const project = await queryOne<{ owner_id: string }>(
    'SELECT owner_id FROM projects WHERE id = ?',
    [projectId],
  );
  if (!project || project.owner_id !== actor.profileId) {
    throw new ReleaseServiceError('release_not_found', 404);
  }

  const releases = await query<OwnerWorldReleaseRow>(
    `SELECT id, status, project_revision, submitted_at, public_slug
       FROM world_releases
      WHERE project_id = ?
      ORDER BY submitted_at DESC, id DESC
      LIMIT ${boundedLimitClause(MAX_OWNER_WORLD_RELEASE_HISTORY, MAX_OWNER_WORLD_RELEASE_HISTORY)}`,
    [projectId],
  );
  if (releases.length === 0) return [];

  const placeholders = releases.map(() => '?').join(',');
  const checks = await query<OwnerWorldReleaseCheckRow>(
    `SELECT world_release_id, check_type, status, reason_code
       FROM world_release_checks
      WHERE world_release_id IN (${placeholders})
      ORDER BY created_at ASC, id ASC`,
    releases.map((release) => release.id),
  );
  const checksByRelease = new Map<string, OwnerWorldReleaseCheck[]>();
  for (const check of checks) {
    const bucket = checksByRelease.get(check.world_release_id) ?? [];
    bucket.push({ name: check.check_type, status: check.status, reasonCode: check.reason_code });
    checksByRelease.set(check.world_release_id, bucket);
  }

  return releases.map((release) => ({
    id: release.id,
    status: release.status,
    sourceRevision: Number(release.project_revision),
    submittedAt: toPublishedAt(release.submitted_at),
    publicSlug: release.public_slug,
    checks: checksByRelease.get(release.id) ?? [],
  }));
}

/** Lists only the current approved releases; database predicates and mapper both fail closed. */
export async function listPublicWorldReleases(
  options: PublicWorldReleaseListOptions = {},
): Promise<PublicWorldRelease[]> {
  const { limit, offset } = normalizeListOptions(options);
  const rows = await query<PublicWorldReleaseRow>(
    `${PUBLIC_WORLD_RELEASE_SELECT}
      WHERE wr.status = 'published'
        AND wr.current_public = TRUE
      ORDER BY wr.published_at DESC, wr.id DESC
      LIMIT ${boundedLimitClause(limit, MAX_PUBLIC_WORLD_RELEASE_PAGE_SIZE)}
     OFFSET ${boundedLimitClause(offset, MAX_PUBLIC_WORLD_RELEASE_PAGE * MAX_PUBLIC_WORLD_RELEASE_PAGE_SIZE)}`,
    [],
  );

  return rows.filter(isCurrentPublicRow).map(toPublicWorldRelease);
}
