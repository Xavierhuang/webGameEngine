import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, resolveLocale, translate, type Locale, type MessageKey } from './messages';

export const LOCALE_COOKIE = 'lingplay-locale';

/**
 * Resolve the request's locale: an explicit cookie choice wins, otherwise the
 * browser's Accept-Language, otherwise English.
 */
export async function getLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies();
    const chosen = cookieStore.get(LOCALE_COOKIE)?.value;
    if (chosen) return resolveLocale(chosen);

    const headerStore = await headers();
    const accept = headerStore.get('accept-language');
    // "zh-CN,zh;q=0.9,en;q=0.8" → first tag
    return resolveLocale(accept?.split(',')[0]?.trim());
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Server-component translator: `const t = await getTranslator()`. */
export async function getTranslator(): Promise<(key: MessageKey) => string> {
  const locale = await getLocale();
  return (key: MessageKey) => translate(locale, key);
}
