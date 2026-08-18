import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  expireLegacyGuestCookie,
  LEGACY_GUEST_COOKIE_NAME,
} from './lib/auth/guestSession';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (request.cookies.has(LEGACY_GUEST_COOKIE_NAME)) {
    expireLegacyGuestCookie(response);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next|api/guest-session$|api/auth/(?:login|signup|logout)$|api/locale$|(?:icon|apple-icon)(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?|ttf|eot)$).*)',
  ],
};
