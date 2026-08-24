import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { moderateText, sanitizeUserInput } from '@/lib/safety/moderation';
import { getLocale } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n/messages';

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

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid project request' }, { status: 422 });
    }
    const candidate = body as Record<string, unknown>;
    // Project creation is deliberately metadata-only. In particular, a caller
    // cannot turn a new draft into a public project by adding legacy
    // publication fields to this request.
    const allowedFields = new Set(['title', 'description', 'genre']);
    if (Object.keys(candidate).some((key) => !allowedFields.has(key))) {
      return NextResponse.json({ error: 'Invalid project request' }, { status: 422 });
    }
    const rawTitle = typeof candidate.title === 'string' ? sanitizeUserInput(candidate.title) : '';
    const rawDescription = typeof candidate.description === 'string' ? sanitizeUserInput(candidate.description) : '';
    const genre = typeof candidate.genre === 'string' ? candidate.genre.substring(0, 100) : null;

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
    const sceneId = randomUUID();

    // Wrapped in withTransaction in Task 4: project + default scene are the
    // shape every editor client expects; a failure between the two would
    // leave a project with no scene at all and the editor with nothing to
    // render. Creation-time write, so it stays on the write-boundary
    // allowlist (no prior revision to fence against).
    const project = await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO projects (id, owner_id, title, description, genre)
         VALUES (?, ?, ?, ?, ?)`,
        [
          projectId,
          actor.profileId,
          rawTitle,
          rawDescription ? rawDescription.substring(0, 500) : null,
          genre,
        ],
      );
      // Default scene name follows the creator's locale — a zh reader
      // starting a new project sees 主场景 in the tab, not "Main Scene".
      // Existing projects keep whatever name is already stored; SceneTabs
      // maps the well-known English default to a localized display at
      // render time so nothing needs a data migration.
      const locale = await getLocale();
      const defaultSceneName = translate(locale, 'editor.sceneTabs.defaultName');
      await connection.execute(
        'INSERT INTO scenes (id, project_id, name, order_index) VALUES (?, ?, ?, ?)',
        [sceneId, projectId, defaultSceneName, 0],
      );
      // Seed a first-run scene so a fresh project doesn't drop the kid on
      // an empty stage with nothing to click. A ground platform + a Hero
      // character is enough to see gizmos, try dragging, and be reminded
      // that the AI tab exists. Mirrors what CharacterSelector/Toolbar
      // would produce when a user manually adds a hero and a platform —
      // same shape / color / size defaults — so the object rows are
      // indistinguishable from user-created ones and the seed can be
      // deleted with the normal delete flow.
      const platformId = randomUUID();
      const heroId = randomUUID();
      const heroName = translate(locale, 'seed.hero');
      const groundName = translate(locale, 'seed.ground');
      // Platform: matches getObjectDefaults('platform') in the editor —
      // plane, dark green, width/height 2000 (pixels in the editor's
      // world-unit convention).
      await connection.execute(
        `INSERT INTO game_objects (id, scene_id, type, name, position_x, position_y, position_z, color, properties)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          platformId,
          sceneId,
          'platform',
          groundName,
          0,
          0,
          0,
          '#166534',
          JSON.stringify({ shape: 'plane', size: { width: 2000, height: 2000 } }),
        ],
      );
      // Hero: uses the packaged hero.glb model so the seed looks like a
      // real character, not a blue box. Matches the character-picker's
      // "Hero" prefab (buildCharacterVisual output for id='hero') — same
      // shape='model', model_url, characterType — so the interpreter and
      // renderer treat it identically to a user-added Hero.
      await connection.execute(
        `INSERT INTO game_objects (id, scene_id, type, name, position_x, position_y, position_z, color, properties)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          heroId,
          sceneId,
          'character',
          heroName,
          500,
          300,
          0,
          '#60A5FA',
          JSON.stringify({
            shape: 'model',
            size: 1,
            model_url: '/models/starters/hero.glb',
            characterType: 'hero',
          }),
        ],
      );
      const [rows] = await connection.execute('SELECT * FROM projects WHERE id = ?', [projectId]);
      const list = rows as Array<Record<string, unknown>>;
      if (list.length === 0) throw new Error('Failed to create project');
      return list[0];
    });

    return NextResponse.json({ project });
  } catch (error: any) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
