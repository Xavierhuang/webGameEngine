'use client';

import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Lightbulb } from 'lucide-react';
import { TUTORIALS, getTutorial, LEVEL_LABELS, type Tutorial } from '@/lib/tutorials/catalog';
import { localizeTutorial, localizeTutorials, levelLabel } from '@/lib/tutorials/translations';
import { useLocale, useTranslator } from '@/components/common/LocaleProvider';
import { TutorialSpotlight } from './TutorialSpotlight';

const STORAGE_KEY = 'lingplay-tutorial-progress';

/** Progress is per-tutorial step index, kept locally — no account needed. */
function loadProgress(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveProgress(progress: Record<string, number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* private browsing — progress just won't persist */
  }
}

/**
 * The account copy of progress (migration 016). localStorage is the offline
 * cache; the server wins on load so a second device or a shared classroom
 * machine picks up where the child left off. Failures are silent: progress
 * is a convenience, never a blocker.
 */
async function loadServerProgress(): Promise<Record<string, number> | null> {
  try {
    const response = await fetch('/api/tutorials/progress');
    if (!response.ok) return null;
    const data = await response.json();
    return data?.progress && typeof data.progress === 'object' ? data.progress : null;
  } catch {
    return null;
  }
}

function saveServerProgress(tutorialId: string, step: number) {
  fetch('/api/tutorials/progress', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tutorialId, step }),
    keepalive: true,
  }).catch(() => { /* offline: the local copy still has it */ });
}

/**
 * Step-by-step tutorial panel, docked beside the editor.
 *
 * The editor previously dropped a first-time child into an empty scene with no
 * guidance at all. Scratch's onboarding is a large part of why beginners get
 * anywhere, so this mirrors its stepped panel — but each tutorial also names
 * the concept it is teaching, not just the blocks to drag.
 */
export function TutorialPanel({
  onClose,
  initialTutorialId,
}: {
  onClose: () => void;
  /** Open straight into this tutorial — how a /learn card lands in the editor. */
  initialTutorialId?: string;
}) {
  const locale = useLocale();
  const t = useTranslator();
  const [activeId, setActiveId] = useState<string | null>(() =>
    initialTutorialId && getTutorial(initialTutorialId) ? initialTutorialId : null,
  );
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    const local = loadProgress();
    setProgress(local);
    let cancelled = false;
    loadServerProgress().then((remote) => {
      if (cancelled || !remote) return;
      // Furthest step wins per tutorial, whichever side has it.
      const merged: Record<string, number> = { ...local };
      for (const [id, value] of Object.entries(remote)) {
        merged[id] = Math.max(merged[id] ?? -1, Number(value));
      }
      setProgress(merged);
      saveProgress(merged);
    });
    return () => { cancelled = true; };
  }, []);

  const tutorials = localizeTutorials(TUTORIALS, locale);
  const tutorial = activeId ? (() => { const base = getTutorial(activeId); return base ? localizeTutorial(base, locale) : null; })() : null;

  const open = (t: Tutorial) => {
    setActiveId(t.id);
    setStep(Math.min(progress[t.id] ?? 0, t.steps.length - 1));
  };

  const goTo = (next: number) => {
    if (!tutorial) return;
    const clamped = Math.max(0, Math.min(next, tutorial.steps.length - 1));
    setStep(clamped);
    const updated = { ...progress, [tutorial.id]: clamped };
    setProgress(updated);
    saveProgress(updated);
    saveServerProgress(tutorial.id, clamped);
  };

  return (
    // `relative z-50` keeps the panel above the spotlight's dim (z-40). Without
    // it the overlay dims the very instructions the child is reading, since the
    // panel is docked in normal flow and would otherwise have no stacking
    // context of its own.
    <aside className="relative z-50 flex h-full w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">
          {tutorial ? tutorial.title : t('learn.panel.title')}
        </h2>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label={t('learn.panel.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!tutorial ? (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          <p className="px-1 pb-1 text-xs leading-relaxed text-slate-500">
            {t('learn.panel.newHere')}
          </p>
          {tutorials.map((tut) => {
            const done = (progress[tut.id] ?? -1) >= tut.steps.length - 1;
            return (
              <button
                key={tut.id}
                onClick={() => open(tut)}
                className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-xl leading-none">{tut.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-slate-900">{tut.title}</span>
                      {done && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{tut.summary}</p>
                    <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {levelLabel(tut.level, locale, LEVEL_LABELS[tut.level])} · {t('learn.panel.minutes').replace('{minutes}', String(tut.minutes))}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4">
            <button
              onClick={() => setActiveId(null)}
              className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
            >
              <ChevronLeft className="h-3 w-3" />
              {t('learn.panel.all')}
            </button>

            {/* The idea being taught, not just the clicks. */}
            <div className="mb-4 flex gap-2 rounded-xl bg-amber-50 p-3">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed text-amber-900">{tutorial.concept}</p>
            </div>

            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {t('learn.panel.stepOf').replace('{step}', String(step + 1)).replace('{total}', String(tutorial.steps.length))}
            </div>
            <h3 className="text-base font-bold text-slate-900">{tutorial.steps[step].title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {tutorial.steps[step].body}
            </p>

            {tutorial.steps[step].hint && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {t('learn.panel.lookAt')} {tutorial.steps[step].hint}
              </p>
            )}

            {/* Highlights the place the line above names. Rendered here so it
                follows the step index without any extra state. */}
            <TutorialSpotlight query={tutorial.steps[step].spotlight} />

            {tutorial.steps[step].blocks && tutorial.steps[step].blocks!.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t('learn.panel.blocksNeeded')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tutorial.steps[step].blocks!.map((b) => (
                    <code
                      key={b}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700"
                    >
                      {b.replace(/_/g, ' ')}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-200 p-3">
            <button
              onClick={() => goTo(step - 1)}
              disabled={step === 0}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-40"
            >
              <ChevronLeft className="h-3 w-3" />
              {t('learn.panel.back')}
            </button>
            <div className="flex-1" />
            {step < tutorial.steps.length - 1 ? (
              <button
                onClick={() => goTo(step + 1)}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                {t('learn.panel.next')}
                <ChevronRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={() => setActiveId(null)}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                <Check className="h-3 w-3" />
                {t('learn.panel.done')}
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
