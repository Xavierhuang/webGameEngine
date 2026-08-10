'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shuffle } from 'lucide-react';

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
const GENRES = ['platformer', 'puzzle', 'adventure', 'racing', 'arcade'];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const randomTitle = () => `${pick(TITLE_ADJECTIVES)} ${pick(TITLE_NOUNS)}`;
const randomDefaults = () => ({
  title: randomTitle(),
  description: pick(DESCRIPTIONS),
  genre: pick(GENRES),
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

  useEffect(() => {
    const d = randomDefaults();
    setTitle(d.title);
    setDescription(d.description);
    setGenre(d.genre);
  }, []);

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
        headers: {
          'Content-Type': 'application/json',
        },
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
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100 p-8">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Projects
        </Link>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-start justify-between mb-6">
            <h1 className="text-3xl font-bold text-purple-600">
              Create New Game
            </h1>
            <button
              type="button"
              onClick={shuffle}
              title="Try a different random name"
              className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              <Shuffle className="w-4 h-4" />
              Shuffle
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-6">
            Everything's ready — just tap <span className="font-semibold text-purple-600">Create Game</span>. Or change anything you like first!
          </p>

          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Game Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={50}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="My Awesome Game"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="What kind of game are you creating?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Genre
              </label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="platformer">Platformer</option>
                <option value="puzzle">Puzzle</option>
                <option value="adventure">Adventure</option>
                <option value="racing">Racing</option>
                <option value="arcade">Arcade</option>
                <option value="other">Other</option>
              </select>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !title}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-bold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Game'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

