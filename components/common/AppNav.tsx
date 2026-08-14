'use client';

import Link from 'next/link';
import { Boxes } from 'lucide-react';
import { PALETTE } from './design';
import { SignOutButton } from './SignOutButton';
import { LocaleSwitcher } from './LocaleSwitcher';
import { useTranslator, useLocale } from './LocaleProvider';

/**
 * Sticky top nav shared by every page (landing, projects, auth).
 *
 * A client component: it is rendered from both server pages and the client
 * page at app/projects/new, so it must not import next/headers. The locale
 * arrives via LocaleProvider, which the root layout feeds from the server.
 */
export function AppNav({
  signedInAs,
}: {
  /** Display name to show in the top-right when the user is signed in. */
  signedInAs?: string;
} = {}) {
  const locale = useLocale();
  const t = useTranslator();

  return (
    <nav className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-slate-900">
          <LogoMark />
          <span>lingplay</span>
        </Link>
        <div className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-700">
          <NavLink href="/projects/new">{t('nav.create')}</NavLink>
          <NavLink href="/explore">{t('nav.explore')}</NavLink>
          <NavLink href="/projects">{t('nav.myGames')}</NavLink>
          <NavLink href="/#learn">{t('nav.learn')}</NavLink>
          <NavLink href="/#safety">{t('nav.forParents')}</NavLink>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher current={locale} />
          {signedInAs ? (
            <span className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-slate-700 pl-3 pr-1 py-1.5 rounded-full bg-slate-100">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: PALETTE.control }}
              />
              {signedInAs}
              {/* The logout endpoint existed but nothing in the UI called it —
                  there was no way to sign out of the product. */}
              <SignOutButton label={t('nav.signOut')} />
            </span>
          ) : (
            <Link
              href="/auth/login"
              className="hidden sm:inline-block text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-1.5"
            >
              {t('nav.signIn')}
            </Link>
          )}
          <Link
            href="/projects/new"
            className="text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-full px-4 py-2 transition"
          >
            {t('nav.startBuilding')}
          </Link>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded-md hover:bg-slate-100">
      {children}
    </Link>
  );
}

export function LogoMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'lg' ? 'w-14 h-14' : 'w-7 h-7';
  const icon = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-8 h-8' : 'w-4 h-4';
  return (
    <span
      className={`inline-flex items-center justify-center ${dims} rounded-md text-white`}
      style={{
        background: `linear-gradient(135deg, ${PALETTE.motion}, ${PALETTE.ai})`,
      }}
    >
      <Boxes className={icon} />
    </span>
  );
}
