import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/mysql/server';
import { getProjectAccess } from '@/lib/auth/access';

/**
 * Export a project as a single portable `.lingplay` file (JSON).
 *
 * State lives across four tables and there was no way to get a project out of
 * the product at all — no `.sb3` equivalent, no backup, no way to move a project
 * between accounts or instances. This is the counterpart to POST /api/projects/import.
 */
// Not exported: Next route modules may only export route handlers and a fixed
// set of config names, so an extra export breaks the generated route types.
const EXPORT_FORMAT_VERSION = 1;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await queryOne<any>('SELECT * FROM projects WHERE id = ?', [id]);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const access = await getProjectAccess(project);
    if (!access.canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scenes = await query<any>(
      'SELECT * FROM scenes WHERE project_id = ? ORDER BY order_index',
      [id]
    );

    const sceneIds = scenes.map((s) => s.id);
    const objects = sceneIds.length
      ? await query<any>(
          `SELECT * FROM game_objects WHERE scene_id IN (${sceneIds.map(() => '?').join(',')})`,
          sceneIds
        )
      : [];

    const objectIds = objects.map((o) => o.id);
    const blocks = objectIds.length
      ? await query<any>(
          `SELECT * FROM logic_blocks WHERE game_object_id IN (${objectIds.map(() => '?').join(',')})
           ORDER BY order_index`,
          objectIds
        )
      : [];

    // Ids are deliberately kept so the tree can be rebuilt, but they're remapped
    // on import — a file must never be able to overwrite an existing project.
    const payload = {
      format: 'lingplay-project',
      version: EXPORT_FORMAT_VERSION,
      exported_at: new Date().toISOString(),
      project: {
        title: project.title,
        description: project.description,
        genre: project.genre,
        thumbnail_url: project.thumbnail_url,
      },
      scenes: scenes.map((scene) => ({
        id: scene.id,
        name: scene.name,
        order_index: scene.order_index,
        background_color: scene.background_color,
        background_image_url: scene.background_image_url,
        physics_enabled: Boolean(scene.physics_enabled),
        gravity_y: scene.gravity_y,
      })),
      game_objects: objects.map((obj) => ({
        id: obj.id,
        scene_id: obj.scene_id,
        type: obj.type,
        name: obj.name,
        position_x: obj.position_x,
        position_y: obj.position_y,
        position_z: obj.position_z,
        rotation: obj.rotation,
        scale_x: obj.scale_x,
        scale_y: obj.scale_y,
        sprite_url: obj.sprite_url,
        color: obj.color,
        width: obj.width,
        height: obj.height,
        has_physics: Boolean(obj.has_physics),
        is_static: Boolean(obj.is_static),
        mass: obj.mass,
        properties: typeof obj.properties === 'string' ? safeParse(obj.properties) : obj.properties ?? {},
      })),
      logic_blocks: blocks.map((block) => ({
        game_object_id: block.game_object_id,
        block_type: block.block_type,
        category: block.category,
        order_index: block.order_index,
        block_data:
          typeof block.block_data === 'string' ? safeParse(block.block_data) : block.block_data ?? {},
      })),
    };

    const filename = `${slugify(project.title || 'project')}.lingplay`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting project:', error);
    return NextResponse.json({ error: 'Failed to export project' }, { status: 500 });
  }
}

function safeParse(raw: string): any {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50) || 'project';
}
