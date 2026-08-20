'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Boxes, Menu, X } from 'lucide-react';
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
 *
 * Below the md breakpoint (<768px) the horizontal link row is replaced with
 * a hamburger button that opens a slide-down panel — previously the nav
 * links simply disappeared on phones with no replacement, so mobile users
 * could not reach Explore / My Games / Learn / For Parents from anywhere.
 */
export function AppNav({
  signedInAs,
}: {
  /** Display name to show in the top-right when the user is signed in. */
  signedInAs?: string;
} = {}) {
  const locale = useLocale();
  const t = useTranslator();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile panel on Escape and when the viewport widens past the
  // md breakpoint (so a rotate-to-landscape doesn't leave a stuck sheet).
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    const onResize = () => {
      if (window.matchMedia('(min-width: 768px)').matches) setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [mobileOpen]);

  return (
    <nav className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-slate-900">
          <LogoMark />
          <span>lingplay</span>
        </Link>
        <div className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-700">
          <NavLink href="/projects/new">{t('nav.create')}</NavLink>
          <NavLink href="/explore">{t('nav.explore')}</NavLink>
          <NavLink href="/projects">{t('nav.myGames')}</NavLink>
          <NavLink href="/learn">{t('nav.learn')}</NavLink>
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
          {/* Hamburger — visible only when the desktop nav row is hidden. */}
          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="app-nav-mobile"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile panel — slides down from the bottom of the nav bar. */}
      {mobileOpen && (
        <div
          id="app-nav-mobile"
          className="md:hidden border-t border-slate-200 bg-white/95 backdrop-blur"
        >
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col text-base font-medium text-slate-700">
            <MobileLink href="/projects/new" onClick={() => setMobileOpen(false)}>{t('nav.create')}</MobileLink>
            <MobileLink href="/explore" onClick={() => setMobileOpen(false)}>{t('nav.explore')}</MobileLink>
            <MobileLink href="/projects" onClick={() => setMobileOpen(false)}>{t('nav.myGames')}</MobileLink>
            <MobileLink href="/learn" onClick={() => setMobileOpen(false)}>{t('nav.learn')}</MobileLink>
            <MobileLink href="/#safety" onClick={() => setMobileOpen(false)}>{t('nav.forParents')}</MobileLink>
            <div className="my-2 h-px bg-slate-100" />
            {signedInAs ? (
              <div className="flex items-center justify-between px-3 py-2">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: PALETTE.control }}
                  />
                  {signedInAs}
                </span>
                <SignOutButton label={t('nav.signOut')} />
              </div>
            ) : (
              <MobileLink href="/auth/login" onClick={() => setMobileOpen(false)}>{t('nav.signIn')}</MobileLink>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function MobileLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="px-3 py-3 rounded-md hover:bg-slate-100 min-h-[44px] flex items-center"
    >
      {children}
    </Link>
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
