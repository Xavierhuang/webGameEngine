import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectEdit } from '@/lib/auth/access';
import { query } from '@/lib/mysql/server';
import { rateLimit, clientKey } from '@/lib/safety/rateLimit';

/** 4MB of base64 is a generous ceiling for a 512x512 PNG. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Save a drawing from the paint editor as a PNG.
 *
 * Takes a data URL rather than multipart because that is what a canvas
 * produces. Only PNG is accepted, and the payload is decoded and re-checked
 * server-side rather than trusted from the declared mime type.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'texture'), 60, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many drawings saved. Please wait a little while.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const actor = await resolveActor(request);
    const { dataUrl, projectId, name } = await request.json();

    if (typeof projectId !== 'string' || !projectId) {
      return NextResponse.json({ error: 'projectId required; personal media is disabled' }, { status: 400 });
    }
    const authorized = await requireProjectEdit(actor, projectId);

    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ error: 'Expected a PNG data URL.' }, { status: 400 });
    }

    const base64 = dataUrl.slice('data:image/png;base64,'.length);
    if (base64.length > MAX_BYTES) {
      return NextResponse.json({ error: 'That drawing is too large.' }, { status: 413 });
    }

    const buffer = Buffer.from(base64, 'base64');
    // Verify the PNG magic number rather than trusting the declared type.
    const isPng =
      buffer.length > 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    if (!isPng) {
      return NextResponse.json({ error: 'That file is not a valid PNG.' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const dir = path.join(process.cwd(), 'public', 'uploads', 'textures');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${id}.png`);
    await fs.writeFile(filePath, buffer);

    const url = `/uploads/textures/${id}.png`;

    try {
      await query(
        `INSERT INTO assets
           (id, project_id, owner_id, asset_type, name, file_url, file_size, mime_type, generated_by_ai)
         VALUES (?, ?, ?, 'texture', ?, ?, ?, 'image/png', FALSE)`,
        [
          id,
          projectId,
          authorized.project.owner_id,
          (typeof name === 'string' && name ? name : 'Drawing').substring(0, 255),
          url,
          buffer.byteLength,
        ]
      );
    } catch (error) {
      console.error('[texture] failed to record asset row:', error);
      await fs.unlink(filePath).catch(() => {});
      throw error;
    }

    return NextResponse.json({ url });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Texture upload failed:', error);
    return NextResponse.json({ error: 'Failed to save the drawing.' }, { status: 500 });
  }
}
