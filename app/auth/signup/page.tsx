'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/common/AuthCard';
import { useTranslator } from '@/components/common/LocaleProvider';
import { ageFromDateOfBirth, COPPA_AGE } from '@/lib/safety/coppa';

/**
 * Child signup page.
 *
 * Task 5: the "I'm a parent" checkbox is gone. Anyone claiming to be a
 * parent enrolls at `/auth/parent-enrollment`, where the server verifies
 * the email address before granting the parent role. The child form
 * never receives a consent URL back — an under-13 signup lands on the
 * pending-approval page which shows their state and a server-rate-limited
 * resend button, never a link.
 */
export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const t = useTranslator();

  const age = dateOfBirth ? ageFromDateOfBirth(dateOfBirth) : null;
  const needsParentEmail = age !== null && age < COPPA_AGE;

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, dateOfBirth, parentEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Account creation failed. Please try again.');
      }

      if (data.success) {
        if (data.consentState === 'pending') {
          // Route to the pending-approval page — it reads consent state
          // from /api/auth/consent/status and offers a rate-limited
          // resend. We never inline a consent URL on this page.
          router.push('/auth/pending-approval');
          return;
        }
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

        <Field label={t('auth.email')}>
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

        <Field label="Date of birth" hint="We use this to keep younger kids safe.">
          <input
            type="date"
            aria-label="Date of birth"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            required
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
          />
        </Field>

        {needsParentEmail && (
          <Field
            label="A parent or guardian's email"
            hint="Because you're under 13, we'll email a grown-up to ask their permission. You can keep building privately while you wait."
          >
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
              placeholder="parent@example.com"
            />
          </Field>
        )}

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
          {loading ? t('auth.creating') : t('auth.signUp')}
        </button>

        {/* Parent enrollment is now a distinct backend flow (the server
            verifies the email before granting parent capabilities). The
            checkbox-based self-declare is gone. */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
          <strong className="font-semibold text-slate-800">Are you a parent?</strong>{' '}
          <Link href="/auth/parent-enrollment" className="text-slate-900 underline underline-offset-2 font-semibold">
            Enroll as a parent
          </Link>{' '}
          instead — we&apos;ll verify your email before turning on the parent controls.
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
