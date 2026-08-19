import type { Metadata } from 'next';
import './globals.css';
import { getLocale } from '@/lib/i18n/server';
import { directionFor } from '@/lib/i18n/direction';
import { LocaleProvider } from '@/components/common/LocaleProvider';
import { ErrorReporter } from '@/components/common/ErrorReporter';

export const metadata: Metadata = {
  title: 'lingplay — Make 3D games with blocks and AI',
  description: 'A creative coding platform for 3D games. Snap blocks together, ask an AI for help, and share your world.',
};

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
