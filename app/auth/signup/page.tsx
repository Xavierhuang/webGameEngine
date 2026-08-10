'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/common/AuthCard';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isParent, setIsParent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, isParent }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Account creation failed. Please try again.');
      }

      if (data.success) {
        router.push('/projects?signup=success');
      }
    } catch (err: any) {
      let errorMessage = err.message || 'Something went wrong';
      if (errorMessage.includes('rate limit') || errorMessage.includes('429') || err.status === 429) {
        errorMessage = 'Too many signup attempts. Please wait 60 seconds and try again.';
      } else if (errorMessage.includes('already registered')) {
        errorMessage = 'This email is already registered. Try signing in instead.';
      } else if (errorMessage.includes('password')) {
        errorMessage = 'Password must be at least 6 characters long.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start building 3D games with blocks and AI."
      footer={
        <p className="text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-slate-900 font-semibold underline underline-offset-2">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSignUp} className="space-y-4">
        <Field label="Username">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
            placeholder="Pick a fun name"
          />
        </Field>

        <Field label="Email">
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

        <Field label="Password" hint="At least 6 characters.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
            placeholder="Pick a strong password"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
          <input
            type="checkbox"
            checked={isParent}
            onChange={(e) => setIsParent(e.target.checked)}
            className="w-4 h-4 accent-slate-900"
          />
          I&apos;m a parent creating an account
        </label>

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
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
          <strong className="font-semibold text-slate-800">For parents:</strong> after signing up
          you can link a child&apos;s account and set up parental controls.
        </div>
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
