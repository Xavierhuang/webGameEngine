import Link from 'next/link';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { getAuthenticatedUser } from '@/lib/mysql/server';
import { TUTORIALS, LEVEL_LABELS, type TutorialLevel } from '@/lib/tutorials/catalog';
import { Clock, ArrowRight } from 'lucide-react';

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

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav signedInAs={user ? 'Player' : undefined} />
      <PageBackdrop />

      <div className="relative mx-auto max-w-4xl px-6 pb-20 pt-12" id="learn">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Learn</h1>
        <p className="mt-2 max-w-xl leading-relaxed text-slate-600">
          Short, step-by-step guides. Each one teaches an idea you can reuse — not
          just a list of blocks to drag. Open any of them inside the editor from
          the <strong>Learn</strong> button.
        </p>

        {ORDER.map((level) => {
          const items = TUTORIALS.filter((t) => t.level === level);
          if (items.length === 0) return null;
          return (
            <section key={level} className="mt-10">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {LEVEL_LABELS[level]}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-lg"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl leading-none">{t.emoji}</span>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900">{t.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{t.summary}</p>
                      </div>
                    </div>

                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                      {t.concept}
                    </p>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        {t.minutes} min · {t.steps.length} steps
                      </span>
                      <Link
                        href="/projects/new"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 hover:underline"
                      >
                        Start
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
