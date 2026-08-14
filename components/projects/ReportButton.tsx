'use client';

import { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { useTranslator } from '../common/LocaleProvider';

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'inappropriate', label: "Something in it isn't OK for kids" },
  { value: 'harassment', label: "It's mean to someone" },
  { value: 'violence', label: "It's too violent or scary" },
  { value: 'spam', label: "It's spam or an advert" },
  { value: 'other', label: 'Something else' },
];

/**
 * Report a project. `POST /api/reports` and the `reports` table both existed,
 * but nothing in the product ever called the endpoint — it was unreachable.
 */
export function ReportButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslator();
  const [reason, setReason] = useState('inappropriate');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, reason, details }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.reason || data?.error || 'Could not send the report.');
        setState('idle');
        return;
      }
      setState('sent');
    } catch {
      setError('Could not reach the server. Try again.');
      setState('idle');
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        title="Tell us about a problem with this game"
      >
        <Flag className="h-4 w-4" />
        {t('project.report')}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">{t('report.title')}</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {state === 'sent' ? (
              <div className="px-5 py-6">
                <p className="text-sm leading-relaxed text-slate-700">
                  Thanks for telling us. A grown-up from our team will look at this
                  game. You don&apos;t need to do anything else.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-4 w-full rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4 px-5 py-5">
                <fieldset className="space-y-2">
                  {REASONS.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={(e) => setReason(e.target.value)}
                        className="h-4 w-4 accent-slate-900"
                      />
                      {r.label}
                    </label>
                  ))}
                </fieldset>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">
                    Anything else we should know? (optional)
                  </span>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </label>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={state === 'busy'}
                  className="w-full rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {state === 'busy' ? t('report.sending') : t('report.send')}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
