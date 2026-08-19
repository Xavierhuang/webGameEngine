'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Home, Mail, RefreshCcw } from 'lucide-react';
import { AuthShell } from '@/components/common/AuthCard';

/**
 * Landing page for an under-13 account whose consent is still pending.
 *
 * Task 5 replaced the old "here's your consent URL" behavior with a
 * server-rate-limited resend button. The child never sees the consent
 * token; the server delivers it to the parent's email address.
 * `/api/auth/consent/resend` returns only the state and next-eligible
 * resend time — no URL, no token.
 */
export default function PendingApprovalPage() {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [nextResendAt, setNextResendAt] = useState<string | null>(null);

  const resend = async () => {
    setState('busy');
    setMessage(null);
    try {
      const response = await fetch('/api/auth/consent/resend', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState('error');
        setMessage(data?.message || data?.error || 'Could not resend the email.');
        if (data?.canResendAt) setNextResendAt(data.canResendAt);
        return;
      }
      setState('sent');
      setMessage(
        data.emailSent
          ? 'A new permission email is on its way.'
          : 'We tried to resend, but the email did not go through. Please contact support.',
      );
      setNextResendAt(data.canResendAt ?? null);
    } catch {
      setState('error');
      setMessage('Could not reach the server. Please try again.');
    }
  };

  return (
    <AuthShell
      title="Almost there"
      subtitle="Your account is created. A parent needs to approve it before you can share games."
      icon={
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 text-amber-700">
          <Mail className="w-6 h-6" />
        </span>
      }
    >
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
        <strong className="font-semibold text-slate-900 block mb-1">What happens next?</strong>
        We&apos;ve emailed a permission link to your parent. Once they approve, you can
        publish games to the community. Until then, you can still build and play
        your own games privately.
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-700">
          <strong className="font-semibold text-slate-900">Didn&apos;t get the email?</strong>{' '}
          Ask them to check spam, then use the button below. We&apos;ll only send a fresh
          link — never share the link yourself.
        </p>
        <button
          onClick={resend}
          disabled={state === 'busy'}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 disabled:opacity-50"
        >
          <RefreshCcw className="w-4 h-4" />
          {state === 'busy' ? 'Sending…' : 'Resend permission email'}
        </button>
        {message && (
          <p className={`mt-3 text-sm ${state === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
            {message}
          </p>
        )}
        {nextResendAt && (
          <p className="mt-2 text-xs text-slate-500">
            Next resend allowed after {new Date(nextResendAt).toLocaleTimeString()}.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <Link
          href="/"
          className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-full font-semibold shadow-lg shadow-slate-900/10 transition"
        >
          <Home className="w-4 h-4" />
          Go home
        </Link>
        <Link
          href="/projects"
          className="w-full inline-flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 py-3 rounded-full font-semibold transition"
        >
          Keep building privately
        </Link>
      </div>
    </AuthShell>
  );
}
