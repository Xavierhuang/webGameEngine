'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from '@/lib/i18n/messages';

/**
 * Carries the server-resolved locale across the server/client boundary.
 *
 * AppNav is rendered from both server pages and one client page
 * (app/projects/new), so it cannot import next/headers itself — doing so fails
 * the build with "you're importing a component that needs next/headers". The
 * root layout resolves the locale once and publishes it here instead.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** `const t = useTranslator()` → `t('nav.explore')`. */
export function useTranslator(): (key: MessageKey) => string {
  const locale = useLocale();
  return (key: MessageKey) => translate(locale, key);
}
