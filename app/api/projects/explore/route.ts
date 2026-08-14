import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql/server';

export interface ExploreProject {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  genre: string | null;
  created_at: Date;
  play_count: number;
  like_count: number;
  remix_count: number;
  remixed_from: string | null;
  author_name: string | null;
  parent_title: string | null;
}

const SORTS: Record<string, string> = {
  newest: 'p.created_at DESC',
  loved: 'p.like_count DESC, p.created_at DESC',
  remixed: 'p.remix_count DESC, p.created_at DESC',
  played: 'p.play_count DESC, p.created_at DESC',
};

/**
 * The public gallery.
 *
 * Only ever returns projects that are BOTH shared publicly AND have cleared
 * moderation — `moderation_status` previously defaulted to 'pending' and was
 * never read by anything, so this is the first query that enforces it.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSearch = (searchParams.get('q') ?? '').trim().substring(0, 100);
    const sort = SORTS[searchParams.get('sort') ?? 'newest'] ?? SORTS.newest;
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 24, 1), 60);
    const genre = (searchParams.get('genre') ?? '').trim().substring(0, 100);

    const where: string[] = [
      "p.visibility = 'public'",
      "p.moderation_status = 'approved'",
    ];
    const args: any[] = [];

    if (rawSearch) {
      where.push('(p.title LIKE ? OR p.description LIKE ?)');
      const like = `%${rawSearch}%`;
      args.push(like, like);
    }
    if (genre) {
      where.push('p.genre = ?');
      args.push(genre);
    }

    const projects = await query<ExploreProject>(
      `SELECT p.id, p.title, p.description, p.thumbnail_url, p.genre, p.created_at,
              p.play_count, p.like_count, p.remix_count, p.remixed_from,
              author.display_name AS author_name,
              parent.title AS parent_title
       FROM projects p
       LEFT JOIN profiles author ON author.id = p.owner_id
       LEFT JOIN projects parent ON parent.id = p.remixed_from
       WHERE ${where.join(' AND ')}
       ORDER BY ${sort}
       LIMIT ${limit}`,
      args
    );

    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error('Error fetching explore feed:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
