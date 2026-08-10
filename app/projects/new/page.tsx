'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shuffle, Sparkles } from 'lucide-react';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';

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
const DESCRIPTIONS = [
  "A super fun game I'm making!",
  'A game about a brave hero on an epic journey.',
  'Collect coins, dodge enemies, save the day!',
  'A colorful world full of surprises.',
  'Jump, run, and explore!',
];
const GENRES: { value: string; label: string; emoji: string }[] = [
  { value: 'platformer', label: 'Platformer', emoji: '🏃' },
  { value: 'puzzle', label: 'Puzzle', emoji: '🧩' },
  { value: 'adventure', label: 'Adventure', emoji: '🗺️' },
  { value: 'racing', label: 'Racing', emoji: '🏎️' },
  { value: 'arcade', label: 'Arcade', emoji: '🕹️' },
  { value: 'other', label: 'Other', emoji: '🎮' },
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const randomTitle = () => `${pick(TITLE_ADJECTIVES)} ${pick(TITLE_NOUNS)}`;
const randomDefaults = () => ({
  title: randomTitle(),
  description: pick(DESCRIPTIONS),
  genre: pick(GENRES.filter((g) => g.value !== 'other')).value,
});

export default function NewProjectPage() {
  // Server-render placeholder defaults so hydration matches; useEffect below
  // rerolls to a fresh random combo the moment the client mounts.
  const [title, setTitle] = useState('My Awesome Game');
  const [description, setDescription] = useState("A super fun game I'm making!");
  const [genre, setGenre] = useState('platformer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

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
        throw new Error(data.error || 'Failed to create project');
      }

      if (data.project) {
        router.push(`/editor/${data.project.id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
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
          Back to My Games
        </Link>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-xl p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                New project
              </div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                Name your game.
              </h1>
              <p className="mt-2 text-slate-600 text-sm">
                Everything's pre-filled — just tap <span className="font-semibold text-slate-900">Create</span>, or change what you like first.
              </p>
            </div>
            <button
              type="button"
              onClick={shuffle}
              title="Reroll a random name"
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-full px-3 py-2 transition"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Shuffle
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-5">
            <Field label="Game title">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={50}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
                placeholder="My Awesome Game"
              />
            </Field>

            <Field label="Description" hint="A one-liner about what the game is.">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900 resize-none"
                placeholder="What kind of game are you creating?"
              />
            </Field>

            <Field label="Genre">
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
                    {g.label}
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
              {loading ? 'Creating…' : 'Create Game'}
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
