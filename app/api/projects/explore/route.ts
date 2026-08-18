import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { listPublicProjects } from '@/lib/auth/publicProjects';

/**
 * The public gallery.
 *
 * Only ever returns projects that are BOTH shared publicly AND have cleared
 * moderation — `moderation_status` previously defaulted to 'pending' and was
 * never read by anything, so this is the first query that enforces it.
 */
export async function GET(request: NextRequest) {
  try {
    await resolveActor(request);
    const { searchParams } = new URL(request.url);
    const projects = await listPublicProjects({
      search: searchParams.get('q') ?? '',
      sort: searchParams.get('sort') ?? 'newest',
      limit: Number(searchParams.get('limit')) || 24,
      genre: searchParams.get('genre') ?? '',
    });

    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error('Error fetching explore feed:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
