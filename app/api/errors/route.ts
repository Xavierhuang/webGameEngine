import { NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/monitoring/errors';
import { getActorProfileId } from '@/lib/auth/access';
import { rateLimit, clientKey } from '@/lib/safety/rateLimit';

/**
 * Receives client-side exceptions from the browser.
 *
 * Rate limited hard: this is an unauthenticated write endpoint, and a page
 * erroring in a render loop could otherwise hammer it.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(clientKey(request, 'errors'), 30, 5 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ ok: true });

  try {
    const { message, stack, url } = await request.json();
    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ ok: true });
    }

    await captureError({
      source: 'client',
      message,
      stack: typeof stack === 'string' ? stack : null,
      url: typeof url === 'string' ? url : null,
      profileId: await getActorProfileId().catch(() => null),
      userAgent: request.headers.get('user-agent'),
    });
  } catch {
    // Reporting an error must never itself error out loudly.
  }
  // Always 200: the browser shouldn't retry or surface a failure here.
  return NextResponse.json({ ok: true });
}
