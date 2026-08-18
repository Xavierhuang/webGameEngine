import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { moderateText, sanitizeUserInput } from '@/lib/safety/moderation';

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveActor(request);

    if (actor.kind === 'anonymous') {
      return NextResponse.json({ projects: [] });
    }

    const projects = await query<{
      id: string;
      owner_id: string;
      title: string;
      description: string | null;
      thumbnail_url: string | null;
      is_published: boolean;
      is_template: boolean;
      visibility: string;
      genre: string | null;
      created_at: Date;
      updated_at: Date;
      last_played_at: Date | null;
      play_count: number;
      like_count: number;
      moderation_status: string;
      moderation_notes: string | null;
    }>(
      'SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC',
      [actor.profileId]
    );

    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Guest session required' }, { status: 401 });
    }

    const body = await request.json();
    const rawTitle = typeof body.title === 'string' ? sanitizeUserInput(body.title) : '';
    const rawDescription = typeof body.description === 'string' ? sanitizeUserInput(body.description) : '';
    const genre = typeof body.genre === 'string' ? body.genre.substring(0, 100) : null;

    // Validate input
    if (!rawTitle || rawTitle.length > 50) {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    }

    // Moderation gate — reject if title or description is unsafe. Concatenated
    // so a single API call covers both fields.
    const modResult = await moderateText(
      `${rawTitle}\n${rawDescription}`,
      actor.kind === 'user' ? actor.userId : null,
      actor.kind === 'guest' ? actor.profileId : null
    );
    if (!modResult.safe) {
      return NextResponse.json(
        {
          error: 'Content moderation failed',
          reason: modResult.reason ?? 'Contains disallowed content',
          categories: modResult.categories,
        },
        { status: 422 }
      );
    }

    const { randomUUID } = await import('crypto');
    const projectId = randomUUID();

    // Insert project
    await query(
      `INSERT INTO projects (id, owner_id, title, description, genre)
       VALUES (?, ?, ?, ?, ?)`,
      [
        projectId,
        actor.profileId,
        rawTitle,
        rawDescription ? rawDescription.substring(0, 500) : null,
        genre,
      ]
    );

    // Fetch created project
    const project = await query<{
      id: string;
      owner_id: string;
      title: string;
      description: string | null;
      thumbnail_url: string | null;
      is_published: boolean;
      is_template: boolean;
      visibility: string;
      genre: string | null;
      created_at: Date;
      updated_at: Date;
      last_played_at: Date | null;
      play_count: number;
      like_count: number;
      moderation_status: string;
      moderation_notes: string | null;
    }>('SELECT * FROM projects WHERE id = ?', [projectId]);

    if (!project || project.length === 0) {
      throw new Error('Failed to create project');
    }

    // Create default scene
    const sceneId = randomUUID();
    await query(
      'INSERT INTO scenes (id, project_id, name, order_index) VALUES (?, ?, ?, ?)',
      [sceneId, projectId, 'Main Scene', 0]
    );

    return NextResponse.json({ project: project[0] });
  } catch (error: any) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
