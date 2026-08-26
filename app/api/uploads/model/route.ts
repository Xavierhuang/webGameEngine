import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectEdit } from '@/lib/auth/access';
import { query } from '@/lib/mysql/server';
import { getModelExtension, validateUploadedModelBytes } from '@/lib/models/modelPolicy';

/** The UI advertises "Max 20 MB" — this is what actually enforces it. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    const form = await request.formData();
    const file = form.get('file') as File | null;
    const projectId = form.get('projectId');
    if (typeof projectId !== 'string' || !projectId) {
      return NextResponse.json({ error: 'projectId required; personal media is disabled' }, { status: 400 });
    }
    const authorized = await requireProjectEdit(actor, projectId);
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (typeof file.size === 'number' && file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 20 MB.' },
        { status: 413 }
      );
    }

    const original = (file as any).name || 'model.glb';
    const ext = getModelExtension(original);
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Re-check after reading: `file.size` is caller-reported metadata.
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 20 MB.' },
        { status: 413 }
      );
    }

    const validation = validateUploadedModelBytes(ext, buffer);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const id = crypto.randomUUID();

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'models');
    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `${id}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    await fs.writeFile(filepath, buffer);

    const url = `/uploads/models/${filename}`;

    // Record the upload. The `assets` table has existed since migration 001 and
    // was read in two places but never written to, so uploads were untracked:
    // no owner, no size, nothing to moderate or clean up against.
    try {
      await query(
        `INSERT INTO assets
           (id, project_id, owner_id, asset_type, name, file_url, file_size, mime_type, generated_by_ai)
         VALUES (?, ?, ?, 'model', ?, ?, ?, ?, FALSE)`,
        [
          id,
          projectId,
          authorized.project.owner_id,
          original.substring(0, 255),
          url,
          buffer.byteLength,
          (file as any).type || null,
        ]
      );
    } catch (error) {
      console.error('[upload] failed to record asset row:', error);
      await fs.unlink(filepath).catch(() => {});
      throw error;
    }

    return NextResponse.json({ url, name: original });
  } catch (e: any) {
    if (e instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: e.status });
    }
    console.error('Upload failed:', e);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
