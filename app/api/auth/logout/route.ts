import { NextResponse } from 'next/server';
import { expireLegacyGuestCookie } from '@/lib/auth/guestSession';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('auth-token');
  expireLegacyGuestCookie(response);
  return response;
}
