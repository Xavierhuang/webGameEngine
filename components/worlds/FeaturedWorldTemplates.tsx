import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { WorldTemplate } from '@/lib/worlds/templates';

const TEMPLATE_TONES: Record<string, string> = {
  platformer: 'from-sky-500/90 via-blue-500/80 to-indigo-600/90',
  obby: 'from-pink-500/90 via-orange-400/80 to-yellow-400/90',
  racing: 'from-orange-500/90 via-rose-500/80 to-violet-600/90',
  story: 'from-violet-600/90 via-purple-500/80 to-amber-400/90',
  pet: 'from-lime-500/90 via-emerald-500/80 to-sky-500/90',
};

type FeaturedWorldTemplatesProps = {
  templates: readonly WorldTemplate[];
  t: (key:
    | 'worlds.eyebrow'
    | 'worlds.title'
    | 'worlds.subtitle'
    | 'worlds.card.choose'
    | 'worlds.card.missions'
    | 'worlds.create') => string;
};

/** A curated on-ramp to maintained, playable starter worlds. */
export default function FeaturedWorldTemplates({ templates, t }: FeaturedWorldTemplatesProps) {
  if (templates.length === 0) return null;

  return (
    <section className="mb-10 overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-[0_24px_70px_-38px_rgba(49,46,129,0.45)]">
      <div className="flex flex-col gap-5 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-sky-50 to-violet-50 px-5 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-indigo-700">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t('worlds.eyebrow')}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{t('worlds.title')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{t('worlds.subtitle')}</p>
        </div>
        <Link
          href="/worlds/new"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-200"
        >
          {t('worlds.create')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 sm:p-6">
        {templates.map((template) => {
          const tone = TEMPLATE_TONES[template.id] ?? 'from-slate-600 via-slate-500 to-slate-700';
          return (
            <article key={`${template.id}-${template.version}`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-950/10">
              <div
                aria-hidden="true"
                className={`relative h-24 overflow-hidden bg-gradient-to-br ${tone}`}
                style={{ backgroundImage: `url(${template.cardArt})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
              >
                <div className="absolute inset-0 bg-slate-900/15" />
              </div>
              <div className="p-4">
                <h3 className="font-black text-slate-900">{template.title}</h3>
                <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-slate-600">{template.description}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                    {t('worlds.card.missions').replace('{count}', String(template.missions.length))}
                  </span>
                  <Link
                    href="/worlds/new"
                    aria-label={`${t('worlds.card.choose')} ${template.title}`}
                    className="inline-flex items-center gap-1 text-xs font-black text-indigo-700 transition group-hover:text-indigo-900"
                  >
                    {t('worlds.card.choose')}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
