'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/common/AuthCard';

/**
 * Server-verified parent enrollment.
 *
 * Task 5 removed the "I'm a parent" checkbox from the child signup form.
 * A parent creating an account now lands here, where the server issues a
 * verification token to the claimed email address before the parent role
 * becomes trusted for consent actions.
 *
 * The account is created immediately (the parent can sign in), but any
 * consent-granting action stays gated on email verification.
 */
export default function ParentEnrollmentPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'sent' | 'sent-but-not-delivered'>('idle');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/parent-enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'Could not enroll. Please try again.');
      }

      if (data.verificationEmailSent) {
        setState('sent');
      } else {
        setState('sent-but-not-delivered');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (state === 'sent') {
    return (
      <AuthShell
        title="Check your email"
        subtitle="We sent a verification link to confirm this address is yours."
      >
        <p className="rounded-xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900">
          Click the link in the email within 24 hours to verify your address.
          Until then you can sign in, but consent actions for your child&apos;s
          account will be held until verification completes.
        </p>
        <button
          onClick={() => router.push('/projects')}
          className="mt-4 w-full rounded-full bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          Continue
        </button>
      </AuthShell>
    );
  }

  if (state === 'sent-but-not-delivered') {
    return (
      <AuthShell
        title="Account created — email couldn't send"
        subtitle="Your account was created but we couldn't deliver the verification link."
      >
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          The email service is currently unavailable. Please contact support so
          your parent account can be verified.
        </p>
        <button
          onClick={() => router.push('/projects')}
          className="mt-4 w-full rounded-full bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          Continue
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Enroll as a parent"
      subtitle="We verify your email before turning on parent controls."
      footer={
        <p className="text-sm text-slate-600">
          Kids should{' '}
          <Link href="/auth/signup" className="text-slate-900 font-semibold underline underline-offset-2">
            create a child account
          </Link>
          {' '}instead. Already have an account?{' '}
          <Link href="/auth/login" className="text-slate-900 font-semibold underline underline-offset-2">
            Sign in
          </Link>
          .
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Your name">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
            placeholder="How your child will see you"
          />
        </Field>

        <Field label="Email" hint="We send a verification link here.">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Password" hint="At least 8 characters.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
            placeholder="Pick a strong password"
          />
        </Field>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-full font-semibold shadow-lg shadow-slate-900/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Enrolling…' : 'Enroll as a parent'}
        </button>

        <p className="text-xs text-slate-500">
          By enrolling you can review and approve your child&apos;s access to
          sharing and publishing features. See our{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          {' '}for details.
        </p>
      </form>
    </AuthShell>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
