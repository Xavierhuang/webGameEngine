import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql/server';
import { resolveActor } from '@/lib/auth/actor';
import { getTutorial } from '@/lib/tutorials/catalog';

/**
 * Per-account tutorial progress (migration 016).
 *
 * Progress used to live only in localStorage, so it was lost on a second
 * device or a shared classroom machine. Guests have profiles too, so this
 * works before an account exists. localStorage stays as the offline cache.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ progress: {} });
    }
    const rows = await query<{ tutorial_id: string; step: number }>(
      'SELECT tutorial_id, step FROM tutorial_progress WHERE profile_id = ?',
      [actor.profileId],
    );
    const progress: Record<string, number> = {};
    for (const row of rows) progress[row.tutorial_id] = Number(row.step);
    return NextResponse.json({ progress });
  } catch (error) {
    console.error('[tutorial-progress] read failed:', error);
    return NextResponse.json({ progress: {} });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (actor.kind === 'anonymous') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const tutorial = typeof body.tutorialId === 'string' ? getTutorial(body.tutorialId) : undefined;
    const step = Number(body.step);
    if (!tutorial || !Number.isInteger(step) || step < 0 || step >= tutorial.steps.length) {
      return NextResponse.json({ error: 'tutorialId and a valid step are required' }, { status: 400 });
    }
    // Furthest step wins: going back to re-read a step must not lose the badge.
    await query(
      `INSERT INTO tutorial_progress (profile_id, tutorial_id, step)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE step = GREATEST(step, VALUES(step))`,
      [actor.profileId, tutorial.id, step],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[tutorial-progress] write failed:', error);
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 });
  }
}
