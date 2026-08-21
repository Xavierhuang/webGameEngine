import type { Metadata } from 'next';
import './globals.css';
import { getLocale } from '@/lib/i18n/server';
import { directionFor } from '@/lib/i18n/direction';
import { translate } from '@/lib/i18n/messages';
import { LocaleProvider } from '@/components/common/LocaleProvider';
import { ErrorReporter } from '@/components/common/ErrorReporter';

// The browser tab title + description come from the same message catalog as
// the in-page UI, so a Chinese reader sees "灵玩 — 用积木和 AI 做 3D 游戏"
// rather than the English default. Next resolves this per-request via the
// locale cookie / Accept-Language chain that `getLocale()` already implements.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: translate(locale, 'meta.title'),
    description: translate(locale, 'meta.description'),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `lang` was hardcoded to "en", which is wrong for screen readers and for the
  // browser's own translation prompt. It now follows the reader's locale — an
  // explicit choice via cookie, else Accept-Language.
  const locale = await getLocale();

  /*
   * `dir` matters as much as `lang` for Arabic, Hebrew, Persian and Urdu.
   * Without it the text renders right-to-left inside a left-to-right layout:
   * punctuation lands on the wrong side of a sentence, the toolbar sits away
   * from the reading eye, and every "next" arrow points backwards. Translating
   * the strings without this produces a page that is technically in the
   * language and unusable in it.
   */
  return (
    <html lang={locale} dir={directionFor(locale)}>
      <body className="antialiased">
        <ErrorReporter />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
