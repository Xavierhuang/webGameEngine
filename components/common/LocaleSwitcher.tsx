'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/messages';

/** Language picker. Writes a cookie that outranks Accept-Language. */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const choose = async (locale: Locale) => {
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
    <div className="hidden items-center gap-0.5 rounded-full bg-slate-100 p-0.5 sm:inline-flex">
      <Languages className="ml-1.5 h-3.5 w-3.5 text-slate-500" aria-hidden />
      {LOCALES.map((locale) => (
        <button
          key={locale}
          onClick={() => choose(locale)}
          disabled={busy}
          aria-current={locale === current ? 'true' : undefined}
          className={`rounded-full px-2 py-1 text-xs font-semibold transition disabled:opacity-60 ${
            locale === current ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {LOCALE_NAMES[locale]}
        </button>
      ))}
    </div>
  );
}
