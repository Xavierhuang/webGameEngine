'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Languages, Check, ChevronDown } from 'lucide-react';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/messages';

/**
 * Language picker.
 *
 * A dropdown rather than inline pills: with seven locales the pill row
 * overflowed the nav and wrapped the CJK names vertically. Writes a cookie
 * that outranks Accept-Language.
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — table stakes for a menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = async (locale: Locale) => {
    setOpen(false);
    if (locale === current || busy) return;
    setBusy(true);
    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
      >
        <Languages className="h-3.5 w-3.5 text-slate-500" aria-hidden />
        <span className="whitespace-nowrap">{LOCALE_NAMES[current]}</span>
        <ChevronDown className={`h-3 w-3 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-1.5 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {LOCALES.map((locale) => (
            <li key={locale}>
              <button
                role="option"
                aria-selected={locale === current}
                onClick={() => choose(locale)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                  locale === current ? 'font-semibold text-slate-900' : 'text-slate-700'
                }`}
              >
                <span className="whitespace-nowrap">{LOCALE_NAMES[locale]}</span>
                {locale === current && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
