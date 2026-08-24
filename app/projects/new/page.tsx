'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shuffle, Sparkles } from 'lucide-react';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { useTranslator } from '@/components/common/LocaleProvider';
import type { MessageKey } from '@/lib/i18n/messages';
import { ensureGuestSession } from '@/lib/auth/guestSessionClient';

// Random game name pool — adjective + noun combos so /projects/new is
// zero-input: a kid lands here and can immediately hit "Create Game" without
// typing anything. Hitting refresh (or the shuffle button) rerolls.
const TITLE_ADJECTIVES = [
  'Super', 'Magic', 'Sparkly', 'Turbo', 'Ninja', 'Space',
  'Rainbow', 'Silly', 'Cosmic', 'Bouncy', 'Sneaky', 'Mighty',
  'Rocket', 'Dragon', 'Robot', 'Pixel',
];
const TITLE_NOUNS = [
  'Adventure', 'Quest', 'Racer', 'Runner', 'Kingdom', 'Playground',
  'Island', 'Party', 'Castle', 'Rescue', 'Chase', 'Treasure',
  'Jungle', 'Voyage',
];
/*
 * New projects start with no description.
 *
 * They used to get a random one from a list, and two of those described
 * specific gameplay — "Collect coins, dodge enemies, save the day!" sat above
 * an empty field containing one character and a platform. A child reads that,
 * looks at the screen, and concludes their game is broken. It was reported
 * exactly that way: "what should I see in the screen?"
 *
 * A random *title* is a friendly nudge and can't be wrong. A description is a
 * claim about contents, and a wrong claim costs trust the moment it is
 * compared with the screen. Blank, with a placeholder inviting them to write
 * one when they have something to describe.
 */
const GENRES: { value: string; labelKey: MessageKey; emoji: string }[] = [
  { value: 'platformer', labelKey: 'newProject.genre.platformer', emoji: '🏃' },
  { value: 'puzzle',     labelKey: 'newProject.genre.puzzle',     emoji: '🧩' },
  { value: 'adventure',  labelKey: 'newProject.genre.adventure',  emoji: '🗺️' },
  { value: 'racing',     labelKey: 'newProject.genre.racing',     emoji: '🏎️' },
  { value: 'arcade',     labelKey: 'newProject.genre.arcade',     emoji: '🕹️' },
  { value: 'other',      labelKey: 'newProject.genre.other',      emoji: '🎮' },
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const randomTitle = () => `${pick(TITLE_ADJECTIVES)} ${pick(TITLE_NOUNS)}`;
const randomDefaults = () => ({
  title: randomTitle(),
  description: '',
  genre: pick(GENRES.filter((g) => g.value !== 'other')).value,
});

export default function NewProjectPage() {
  // useSearchParams() forces client-side rendering; Next 14 requires a
  // Suspense boundary around any component that reads it so the outer page
  // can still be statically prerendered.
  return (
    <Suspense fallback={null}>
      <NewProjectPageInner />
    </Suspense>
  );
}

function NewProjectPageInner() {
  const t = useTranslator();
  // Server-render placeholder defaults so hydration matches; useEffect below
  // rerolls to a fresh random combo the moment the client mounts.
  const [title, setTitle] = useState('My Awesome Game');
  const [description, setDescription] = useState("A super fun game I'm making!");
  const [genre, setGenre] = useState('platformer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Localized subtitle: "…just tap Create, or change what you like first."
  // The {createBold} placeholder wraps a bolded, non-linking word to match
  // the original design; splitting on the marker keeps translation-agnostic
  // word order (e.g. Chinese moves "创建" to the end).
  const subtitleTemplate = t('newProject.subtitle');
  const [subtitleBefore, subtitleAfter] = subtitleTemplate.includes('{createBold}')
    ? subtitleTemplate.split('{createBold}')
    : [subtitleTemplate, ''];

  useEffect(() => {
    const d = randomDefaults();
    setTitle(d.title);
    setDescription(d.description);
    // Landing gallery cards pass ?genre= so "Start building this idea" preselects
    // the right genre. Only override if the query value is one we recognize.
    const requestedGenre = searchParams?.get('genre');
    if (requestedGenre && GENRES.some((g) => g.value === requestedGenre)) {
      setGenre(requestedGenre);
    } else {
      setGenre(d.genre);
    }
  }, [searchParams]);

  const shuffle = () => {
    const d = randomDefaults();
    setTitle(d.title);
    setDescription(d.description);
    setGenre(d.genre);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await ensureGuestSession();
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          genre: genre || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('newProject.error.default'));
      }

      if (data.project) {
        router.push(`/editor/${data.project.id}`);
      }
    } catch (err: any) {
      setError(err.message || t('newProject.error.default'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-white overflow-hidden">
      <AppNav />
      <PageBackdrop />

      <div className="relative max-w-2xl mx-auto px-6 pt-8 pb-16">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('newProject.back')}
        </Link>

        <Link
          href="/worlds/new"
          className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 transition hover:border-sky-300 hover:bg-sky-100"
        >
          <span>
            <span className="block text-xs font-bold uppercase tracking-wider text-sky-700">{t('worlds.eyebrow')}</span>
            {t('newProject.createWorld')}
          </span>
          <Sparkles className="h-5 w-5" />
        </Link>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-xl p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                {t('newProject.eyebrow')}
              </div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                {t('projects.blankGame')}
              </h1>
              <p className="mt-2 text-slate-600 text-sm">
                {subtitleBefore}
                <span className="font-semibold text-slate-900">{t('newProject.createInline')}</span>
                {subtitleAfter}
              </p>
            </div>
            <button
              type="button"
              onClick={shuffle}
              title={t('newProject.shuffleTitle')}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-full px-3 py-2 transition"
            >
              <Shuffle className="w-3.5 h-3.5" />
              {t('newProject.shuffle')}
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-5">
            <Field label={t('newProject.field.title')}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={50}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
                placeholder={t('newProject.field.titlePlaceholder')}
              />
            </Field>

            <Field label={t('newProject.field.description')} hint={t('newProject.field.descriptionHint')}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900 resize-none"
                placeholder={t('newProject.field.descriptionPlaceholder')}
              />
            </Field>

            <Field label={t('newProject.field.genre')}>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGenre(g.value)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition ${
                      genre === g.value
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <span className="text-lg">{g.emoji}</span>
                    {t(g.labelKey)}
                  </button>
                ))}
              </div>
            </Field>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !title}
              className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-full font-semibold shadow-lg shadow-slate-900/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? t('newProject.submitLoading') : t('newProject.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800 mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
