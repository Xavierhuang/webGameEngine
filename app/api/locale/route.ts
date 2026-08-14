import { NextRequest, NextResponse } from 'next/server';
import { resolveLocale } from '@/lib/i18n/messages';
import { LOCALE_COOKIE } from '@/lib/i18n/server';

/** Persist an explicit language choice; it wins over Accept-Language. */
export async function POST(request: NextRequest) {
  const { locale } = await request.json().catch(() => ({ locale: null }));
  const resolved = resolveLocale(typeof locale === 'string' ? locale : null);

  const response = NextResponse.json({ locale: resolved });
  response.cookies.set(LOCALE_COOKIE, resolved, {
    httpOnly: false, // read by the client switcher to show the current choice
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
