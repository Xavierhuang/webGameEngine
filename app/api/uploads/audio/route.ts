import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getActorProfileId } from '@/lib/auth/access';
import { query } from '@/lib/mysql/server';
import { rateLimit, clientKey } from '@/lib/safety/rateLimit';

/** ~30 seconds of compressed audio is plenty for a sound effect. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Store a sound recorded from the microphone.
 *
 * Recording is how a child gets a *real* sound into a project: the built-in
 * library is synthesized, and shipping a thousand licensed samples isn't an
 * option. Scratch has had this since 2.0.
 *
 * Accepts webm/ogg/mp4/wav — whatever the browser's MediaRecorder produced —
 * and sniffs the container rather than trusting the declared type.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'audio'), 40, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many recordings saved. Please wait a little while.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const actorProfileId = await getActorProfileId();
    if (!actorProfileId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get('audio') as File | null;
    const name = form.get('name');
    const projectId = form.get('projectId');

    if (!file) {
      return NextResponse.json({ error: 'No recording provided.' }, { status: 400 });
    }
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'That recording is too long.' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'That recording is too long.' }, { status: 413 });
    }
    if (buffer.byteLength < 64) {
      return NextResponse.json({ error: 'That recording is empty.' }, { status: 400 });
    }

    // Sniff the container. MediaRecorder output varies by browser, so several
    // are valid — but it must actually be audio, not an arbitrary upload.
    const ext = sniffAudio(buffer);
    if (!ext) {
      return NextResponse.json({ error: 'That file is not a supported audio recording.' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const dir = path.join(process.cwd(), 'public', 'uploads', 'audio');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${id}.${ext}`), buffer);

    const url = `/uploads/audio/${id}.${ext}`;

    try {
      await query(
        `INSERT INTO assets
           (id, project_id, owner_id, asset_type, name, file_url, file_size, mime_type, generated_by_ai)
         VALUES (?, ?, ?, 'sound', ?, ?, ?, ?, FALSE)`,
        [
          id,
          typeof projectId === 'string' && projectId ? projectId : null,
          actorProfileId,
          (typeof name === 'string' && name ? name : 'Recording').substring(0, 255),
          url,
          buffer.byteLength,
          file.type || `audio/${ext}`,
        ]
      );
    } catch (error) {
      console.error('[audio] failed to record asset row:', error);
    }

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('Audio upload failed:', error);
    return NextResponse.json({ error: 'Failed to save the recording.' }, { status: 500 });
  }
}

/** Identify the audio container from its magic bytes. */
function sniffAudio(b: Buffer): string | null {
  // WebM / Matroska: 1A 45 DF A3
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  // Ogg: "OggS"
  if (b.slice(0, 4).toString('ascii') === 'OggS') return 'ogg';
  // WAV: "RIFF"...."WAVE"
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WAVE') return 'wav';
  // MP4 / M4A: "ftyp" at offset 4
  if (b.slice(4, 8).toString('ascii') === 'ftyp') return 'm4a';
  // MP3: ID3 tag or a frame sync
  if (b.slice(0, 3).toString('ascii') === 'ID3') return 'mp3';
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  return null;
}
