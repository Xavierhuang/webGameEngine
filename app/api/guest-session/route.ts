import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { createGuestProfile } from '@/lib/auth/guest';
import {
  expireLegacyGuestCookie,
  GUEST_COOKIE,
  issueGuestSession,
} from '@/lib/auth/guestSession';
import { guestSessionStore } from '@/lib/mysql/server';

async function handlePost(request: Request) {
  const actor = await resolveActor(request);
  if (actor.kind === 'user') {
    return NextResponse.json({ success: true });
  }

  const profileId = actor.kind === 'guest'
    ? actor.profileId
    : await createGuestProfile();
  const cookieStore = await cookies();
  const parentToken = actor.kind === 'guest'
    ? cookieStore.get(GUEST_COOKIE.name)?.value ?? null
    : null;
  const issued = await issueGuestSession(guestSessionStore, profileId, parentToken);
  const response = NextResponse.json({ success: true });
  const { name, ...options } = GUEST_COOKIE;
  response.cookies.set(name, issued.token, options);
  return response;
}

export async function POST(request: Request) {
  let response: NextResponse;
  try {
    response = await handlePost(request);
  } catch (error) {
    console.error('[guest-session] failed:', error);
    response = NextResponse.json({ error: 'Failed to create guest session' }, { status: 500 });
  }
  expireLegacyGuestCookie(response);
  return response;
}
