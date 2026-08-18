import { query } from '@/lib/mysql/server';
import { toPublicProjectDto, type PublicProjectDto } from '@/lib/auth/publicProjectDto';

const SORTS = Object.freeze({
  newest: 'p.created_at DESC',
  loved: 'p.like_count DESC, p.created_at DESC',
  remixed: 'p.remix_count DESC, p.created_at DESC',
  played: 'p.play_count DESC, p.created_at DESC',
});

export type PublicProjectSort = keyof typeof SORTS;

export interface PublicProjectListItem extends PublicProjectDto {
  parent: { id: string; title: string } | null;
}

interface PublicProjectRow {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  genre: string | null;
  created_at: Date;
  updated_at: Date;
  play_count: number;
  like_count: number;
  remix_count: number;
  remixed_from: string | null;
  visibility: string;
  moderation_status: string;
  author_username: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  parent_id: string | null;
  parent_title: string | null;
}

/** The sole live-graph gallery query: published rows in, allowlisted DTOs out. */
export async function listPublicProjects(options: {
  search?: string;
  genre?: string;
  sort?: string;
  limit?: number;
} = {}): Promise<PublicProjectListItem[]> {
  const search = (options.search ?? '').trim().substring(0, 100);
  const genre = (options.genre ?? '').trim().substring(0, 100);
  const sort = Object.prototype.hasOwnProperty.call(SORTS, options.sort ?? '')
    ? (options.sort as PublicProjectSort)
    : 'newest';
  const limit = Math.min(Math.max(Number(options.limit) || 24, 1), 60);
  const where = ["p.visibility = 'public'", "p.moderation_status = 'published'"];
  const values: unknown[] = [];

  if (search) {
    where.push('(p.title LIKE ? OR p.description LIKE ?)');
    values.push(`%${search}%`, `%${search}%`);
  }
  if (genre) {
    where.push('p.genre = ?');
    values.push(genre);
  }

  const rows = await query<PublicProjectRow>(
    `SELECT p.id, p.title, p.description, p.thumbnail_url, p.genre,
            p.created_at, p.updated_at, p.play_count, p.like_count,
            p.remix_count, p.remixed_from, p.visibility, p.moderation_status,
            author.username AS author_username,
            author.display_name AS author_name,
            author.avatar_url AS author_avatar_url,
            parent.id AS parent_id, parent.title AS parent_title
       FROM projects p
       LEFT JOIN profiles author ON author.id = p.owner_id
       LEFT JOIN projects parent
         ON parent.id = p.remixed_from
        AND parent.visibility = 'public'
        AND parent.moderation_status = 'published'
      WHERE ${where.join(' AND ')}
      ORDER BY ${SORTS[sort]}
      LIMIT ${limit}`,
    values
  );

  return rows.map((row) => ({
    ...toPublicProjectDto(row, {
      username: row.author_username,
      display_name: row.author_name,
      avatar_url: row.author_avatar_url,
    }),
    parent: row.parent_id && row.parent_title
      ? { id: row.parent_id, title: row.parent_title }
      : null,
  }));
}
