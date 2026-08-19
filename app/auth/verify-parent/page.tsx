'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AuthShell } from '@/components/common/AuthCard';

/**
 * Landing page for the parent-enrollment verification link.
 *
 * The parent-enrollment API mints an email-verification token and delivers
 * it via email. Clicking the link lands here, which posts the token to
 * `/api/auth/verify-parent`. Success flips the parent's profile to
 * verified — every subsequent consent decision they submit is honored.
 *
 * Renders one of four states: no-token (missing param), busy, verified,
 * or a rejection with the wire-provided reason message.
 */
export default function VerifyParentPage(props: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'verified' | 'error' | 'no-token'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // useRef so the strict-mode double-invoke of the effect doesn't send the
  // token twice — the second POST would always hit "already-answered".
  const started = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = await props.searchParams;
      const t = params?.token ?? '';
      if (cancelled) return;
      if (!t) {
        setState('no-token');
        return;
      }
      setToken(t);
      if (started.current) return;
      started.current = true;
      setState('busy');
      try {
        const response = await fetch('/api/auth/verify-parent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: t }),
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok) {
          setState('verified');
        } else {
          setState('error');
          setMessage(data?.message || data?.error || 'Verification failed.');
        }
      } catch {
        if (cancelled) return;
        setState('error');
        setMessage('Could not reach the server. Please try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.searchParams]);

  if (state === 'no-token') {
    return (
      <AuthShell
        title="Missing verification link"
        subtitle="Please open the exact link we emailed you."
      >
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          This page needs the token from the verification email. Links expire
          after 24 hours — if yours is stale, enroll again to receive a fresh one.
        </p>
        <Link
          href="/auth/parent-enrollment"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          Enroll again
        </Link>
      </AuthShell>
    );
  }

  if (state === 'verified') {
    return (
      <AuthShell
        title="Email verified"
        subtitle="You can now approve consent requests for your child's account."
      >
        <p className="rounded-xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900">
          Thanks — your parent account is verified. If a consent request is
          waiting from your child, you&apos;ll see it in your email inbox.
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          Continue
        </Link>
      </AuthShell>
    );
  }

  if (state === 'error') {
    return (
      <AuthShell
        title="Verification failed"
        subtitle="We couldn't verify this link."
      >
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-900">
          {message ?? 'Something went wrong. Please try again.'}
        </p>
        <Link
          href="/auth/parent-enrollment"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          Enroll again
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Verifying your email…" subtitle="Just a moment.">
      <div className="flex items-center justify-center py-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      </div>
      <p className="text-center text-xs text-slate-500">Token: {token ? `${token.slice(0, 6)}…` : '—'}</p>
    </AuthShell>
  );
}
