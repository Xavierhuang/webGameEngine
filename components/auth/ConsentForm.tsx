'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';

export function ConsentForm({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'granted' | 'denied'>('idle');
  const [error, setError] = useState<string | null>(null);

  const respond = async (decision: 'granted' | 'denied') => {
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/auth/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'Something went wrong. Please try again.');
        setState('idle');
        return;
      }
      setState(decision);
    } catch {
      setError('Could not reach the server. Please try again.');
      setState('idle');
    }
  };

  if (state === 'granted') {
    return (
      <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900">
        <Check className="mr-1 inline h-4 w-4" />
        Thank you — permission granted. Your child can now share their games.
      </p>
    );
  }

  if (state === 'denied') {
    return (
      <p className="mt-6 rounded-xl bg-slate-100 p-4 text-sm leading-relaxed text-slate-700">
        Permission declined. Your child can still build and play their own games
        privately, but nothing they make will be shared publicly.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => respond('granted')}
          disabled={state === 'busy'}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          I give permission
        </button>
        <button
          onClick={() => respond('denied')}
          disabled={state === 'busy'}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-60"
        >
          <X className="h-4 w-4" />
          No, not right now
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
