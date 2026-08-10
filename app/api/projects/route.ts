import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, query } from '@/lib/mysql/server';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    // If no user, return empty projects array (guest users)
    if (!user) {
      return NextResponse.json({ projects: [] });
    }

    // Get profile id from user_id
    const profile = await query<{ id: string }>(
      'SELECT id FROM profiles WHERE user_id = ?',
      [user.id]
    );

    if (!profile || profile.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    const profileId = profile[0].id;

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
      [profileId]
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
    // Allow both authenticated and guest users
    const user = await getAuthenticatedUser();
    let profileId: string;

    if (user) {
      // Authenticated user - get their profile
      const profile = await query<{ id: string }>(
        'SELECT id FROM profiles WHERE user_id = ?',
        [user.id]
      );

      if (!profile || profile.length === 0) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      profileId = profile[0].id;
    } else {
      // Guest user - create a temporary guest user and profile
      const { getOrCreateGuestUser } = await import('@/lib/auth/guest');
      const guest = await getOrCreateGuestUser();
      profileId = guest.profileId;
    }

    const body = await request.json();
    const { title, description, genre } = body;

    // Validate input
    if (!title || title.length > 50) {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    }

    const { randomUUID } = await import('crypto');
    const projectId = randomUUID();

    // Insert project
    await query(
      `INSERT INTO projects (id, owner_id, title, description, genre)
       VALUES (?, ?, ?, ?, ?)`,
      [
        projectId,
        profileId,
        title,
        description?.substring(0, 500) || null,
        genre || null,
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

