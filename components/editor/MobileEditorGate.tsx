'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Boxes, Monitor, Play, Search } from 'lucide-react';
import { useTranslator } from '@/components/common/LocaleProvider';

/**
 * Client-side viewport gate for the block editor.
 *
 * The editor is a block workspace + 3D canvas + properties panel + AI
 * assistant, all on-screen at once. On a 375px phone those collapse into
 * unusable slivers. Rather than pretend to be responsive and ship a broken
 * authoring experience, this gate detects small viewports at mount and
 * shows a friendly "open on a bigger screen" screen instead — with links
 * back to the parts of the app that DO work on a phone (browsing,
 * playing, signing in).
 *
 * The threshold matches Tailwind's `md` (768px). At exactly md a phone in
 * landscape can still just barely fit the layout, so we err on the side of
 * showing the editor — the block panel will scroll if it must.
 */
export function MobileEditorGate({ children }: { children: ReactNode }) {
  // undefined during SSR/first paint so we don't flash the wrong content.
  // The gate only renders after the client knows its viewport.
  const [state, setState] = useState<'unknown' | 'ok' | 'small'>('unknown');

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const update = () => setState(mql.matches ? 'ok' : 'small');
    update();
    // Rotate-to-landscape on a phone should unlock the editor without a
    // reload; rotate-to-portrait should re-gate.
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  if (state === 'unknown') return null;
  if (state === 'ok') return <>{children}</>;
  return <MobileGateScreen />;
}

function MobileGateScreen() {
  const t = useTranslator();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-orange-500 text-white">
            <Boxes className="w-4 h-4" />
          </span>
          <span className="font-bold text-lg text-slate-900">lingplay</span>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-6">
            <Monitor className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">
            {t('editor.mobile.title')}
          </h1>
          <p className="mt-3 text-slate-600 leading-relaxed">
            {t('editor.mobile.subtitle')}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/explore"
              className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-5 py-3 text-base transition"
            >
              <Search className="w-4 h-4" />
              {t('editor.mobile.exploreCta')}
            </Link>
            <Link
              href="/projects"
              className="inline-flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 font-semibold rounded-full px-5 py-3 text-base transition"
            >
              <Play className="w-4 h-4" />
              {t('editor.mobile.myGamesCta')}
            </Link>
          </div>
          <p className="mt-8 text-xs text-slate-500">
            {t('editor.mobile.rotationHint')}
          </p>
        </div>
      </main>
    </div>
  );
}
