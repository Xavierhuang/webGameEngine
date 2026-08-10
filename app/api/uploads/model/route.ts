import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_EXTS = new Set(['glb', 'gltf', 'obj', 'stl', 'fbx', 'dae']);

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const original = (file as any).name || 'model.glb';
    const ext = (original.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const id = crypto.randomUUID();

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'models');
    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `${id}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    await fs.writeFile(filepath, buffer);

    const url = `/uploads/models/${filename}`;
    return NextResponse.json({ url, name: original });
  } catch (e: any) {
    console.error('Upload failed:', e);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}


