'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';

/** Toggle a "love-it". Optimistic, and reconciles with the server's count. */
export function LikeButton({
  projectId,
  initialCount,
}: {
  projectId: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/like`, { method: 'POST' });
      if (!response.ok) return;
      const data = await response.json();
      setLiked(Boolean(data.liked));
      setCount(Number(data.like_count ?? count));
    } catch {
      // Non-critical — leave the current state alone.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-full border px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
        liked
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 text-slate-800 hover:border-slate-300'
      }`}
      title={liked ? 'Remove your love-it' : 'Love this game'}
    >
      <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
      {count}
    </button>
  );
}
