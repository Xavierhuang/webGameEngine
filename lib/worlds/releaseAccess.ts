import { query, queryOne } from '@/lib/mysql/server';
import {
  isPublicWorldRelease,
  type PublicWorldRelease,
  type WorldReleaseStatus,
} from './releaseTypes';

interface PublicWorldReleaseRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  template_id: string;
  genre: string | null;
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

function toPublishedAt(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

/** Explicit allowlist: authority, consent, snapshot, and reviewer fields cannot cross this boundary. */
export function toPublicWorldRelease(row: PublicWorldReleaseRow): PublicWorldRelease {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    templateId: row.template_id,
    genre: row.genre,
    creatorLabel: row.creator_label,
    publishedAt: toPublishedAt(row.published_at),
    likeCount: row.like_count,
    playCount: row.play_count,
    remixCount: row.remix_count,
  };
}

const PUBLIC_WORLD_RELEASE_SELECT = `
  SELECT wr.id, wr.public_slug AS slug,
         p.title, p.description, p.thumbnail_url,
         wr.template_id, p.genre, wr.creator_label, wr.published_at,
         p.like_count, p.play_count, p.remix_count,
         wr.status, wr.current_public
    FROM world_releases wr
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
      LIMIT ? OFFSET ?`,
    [limit, offset],
  );

  return rows.filter(isCurrentPublicRow).map(toPublicWorldRelease);
}
