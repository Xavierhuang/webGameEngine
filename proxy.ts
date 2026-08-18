import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { LEGACY_GUEST_COOKIE_NAME } from './lib/auth/guestSession';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (request.cookies.has(LEGACY_GUEST_COOKIE_NAME)) {
    response.cookies.set(LEGACY_GUEST_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next|api/guest-session(?:/|$)|api/auth(?:/|$)|api/locale(?:/|$)|(?:icon|apple-icon)(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?|ttf|eot)$).*)',
  ],
};
