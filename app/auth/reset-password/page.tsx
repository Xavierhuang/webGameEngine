'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { AuthShell } from '@/components/common/AuthCard';

/** Complete a password reset from an emailed single-use link. */
function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'Could not reset your password.');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You can sign in with your new password now.">
        <button
          onClick={() => router.push('/auth/login')}
          className="w-full rounded-full bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          Sign in
        </button>
      </AuthShell>
    );
  }

  if (!token) {
    return (
      <AuthShell title="Reset link missing" subtitle="Open the link from your email exactly as it was sent.">
        <Link
          href="/auth/forgot-password"
          className="block w-full rounded-full bg-slate-900 py-3 text-center font-semibold text-white transition hover:bg-slate-800"
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Make it at least 8 characters."
      icon={
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <KeyRound className="h-6 w-6" />
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="New password"
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-slate-900"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Confirm new password"
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-slate-900"
        />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  );
}

/**
 * useSearchParams() opts the tree into client-side rendering, so Next requires
 * a Suspense boundary or the page fails to prerender at build time.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Reset your password" subtitle="Loading…">
          <div className="h-24" />
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
