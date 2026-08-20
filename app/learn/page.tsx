import Link from 'next/link';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { getAuthenticatedUser } from '@/lib/mysql/server';
import { TUTORIALS, LEVEL_LABELS, type TutorialLevel } from '@/lib/tutorials/catalog';
import { Clock, ArrowRight } from 'lucide-react';
import { getTranslator } from '@/lib/i18n/server';

export const metadata = {
  title: 'Learn — lingplay',
};

const ORDER: TutorialLevel[] = ['first', 'easy', 'medium'];

/**
 * Public tutorial index.
 *
 * The landing page linked to "#learn", an anchor with no tutorials behind it —
 * a first-time visitor had nowhere to start.
 */
export default async function LearnPage() {
  const user = await getAuthenticatedUser();
  const t = await getTranslator();

  // Subtitle interpolates a bolded "Learn" word — split so the bold can move
  // per grammar (Chinese places 学习 in a different position).
  const subtitleTemplate = t('learn.subtitle');
  const [subtitleBefore, subtitleAfter] = subtitleTemplate.includes('{learnBold}')
    ? subtitleTemplate.split('{learnBold}')
    : [subtitleTemplate, ''];

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav signedInAs={user ? 'Player' : undefined} />
      <PageBackdrop />

      <div className="relative mx-auto max-w-4xl px-6 pb-20 pt-12" id="learn">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">{t('learn.title')}</h1>
        <p className="mt-2 max-w-xl leading-relaxed text-slate-600">
          {subtitleBefore}
          <strong>{t('learn.learnBold')}</strong>
          {subtitleAfter}
        </p>

        {ORDER.map((level) => {
          const items = TUTORIALS.filter((tut) => tut.level === level);
          if (items.length === 0) return null;
          return (
            <section key={level} className="mt-10">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {LEVEL_LABELS[level]}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((tut) => (
                  <div
                    key={tut.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-lg"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl leading-none">{tut.emoji}</span>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900">{tut.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{tut.summary}</p>
                      </div>
                    </div>

                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                      {tut.concept}
                    </p>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        {t('learn.stepsCount')
                          .replace('{minutes}', String(tut.minutes))
                          .replace('{steps}', String(tut.steps.length))}
                      </span>
                      <Link
                        href="/projects/new"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 hover:underline"
                      >
                        {t('learn.start')}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
