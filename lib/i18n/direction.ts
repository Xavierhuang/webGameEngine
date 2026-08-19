/**
 * Which languages read right to left.
 *
 * The document was hardcoded to `<html lang={locale}>` with no `dir`, so Arabic
 * and Hebrew rendered as right-to-left *text* inside a left-to-right *layout*:
 * punctuation lands on the wrong side, the toolbar sits opposite the reading
 * eye, and every "next" arrow points backwards. Translating the strings without
 * this produces a page that is technically in the language and unusable in it.
 *
 * Pure and dependency-free so a bare `tsc` test can require it, and so
 * `app/layout.tsx` can call it during a server render.
 */

/** Locales written right to left. Kept as bare codes, not full tags. */
export const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi']);

export type Direction = 'ltr' | 'rtl';

/**
 * The `dir` attribute for a locale.
 *
 * Accepts full tags (`ar-EG`) as well as bare codes, because Accept-Language
 * and the locale cookie both carry regions.
 */
export function directionFor(locale: string | null | undefined): Direction {
  if (!locale) return 'ltr';
  const base = String(locale).toLowerCase().split(/[-_]/)[0];
  return RTL_LOCALES.has(base) ? 'rtl' : 'ltr';
}

/** True when a locale needs the mirrored layout. */
export function isRTL(locale: string | null | undefined): boolean {
  return directionFor(locale) === 'rtl';
}
