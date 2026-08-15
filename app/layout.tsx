import type { Metadata } from 'next';
import './globals.css';
import { getLocale } from '@/lib/i18n/server';
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

  return (
    <html lang={locale}>
      <body className="antialiased">
        <ErrorReporter />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
