'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/common/AuthCard';
import { useTranslator } from '@/components/common/LocaleProvider';
import { ageFromDateOfBirth, COPPA_AGE } from '@/lib/safety/coppa';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isParent, setIsParent] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentUrl, setConsentUrl] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [awaitingConsent, setAwaitingConsent] = useState(false);
  const router = useRouter();
  const t = useTranslator();

  // Ask for a parent's email as soon as the entered birthday puts the child
  // under 13 — mirrors the server-side rule in lib/safety/coppa.ts.
  const age = dateOfBirth ? ageFromDateOfBirth(dateOfBirth) : null;
  const needsParentEmail = !isParent && age !== null && age < COPPA_AGE;

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username, isParent, dateOfBirth, parentEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Account creation failed. Please try again.');
      }

      if (data.success) {
        // Under-13s land on a page showing the consent link for their parent
        // rather than being dropped straight into the product.
        if (data.requiresParentalConsent) {
          setAwaitingConsent(true);
          setSentTo(data.parentEmailSent ? data.parentEmail : null);
          setConsentUrl(data.consentUrl ?? null);
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

  // There is no mail transport in this codebase yet, so rather than claiming
  // "we've emailed your parent" (which the old pending-approval page did while
  // sending nothing), we show the link for the child to hand over.
  if (awaitingConsent) {
    return (
      <AuthShell
        title="Almost there — ask a grown-up"
        subtitle="Your account is made, but a parent needs to say yes before you can share games."
      >
        <div className="space-y-4">
          {sentTo ? (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-900">
              We&apos;ve emailed <strong>{sentTo}</strong> a link to give permission.
              Once they say yes, you can publish your games for other people to
              play and remix.
            </p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-slate-700">
                We couldn&apos;t send the email right now, so show this link to your
                parent or guardian instead.
              </p>
              {consentUrl && (
                <input
                  readOnly
                  value={consentUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                />
              )}
            </>
          )}
          <p className="text-xs leading-relaxed text-slate-500">
            You can still build and play your own games right now — they just stay
            private until then.
          </p>
          <button
            onClick={() => router.push('/projects?signup=success')}
            className="w-full rounded-full bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
            Start building
          </button>
        </div>
      </AuthShell>
    );
  }

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

        {/* Date of birth drives the age band, content filter, and whether a
            parent must consent before anything can be shared publicly. */}
        <Field label="Date of birth" hint="We use this to keep younger kids safe.">
          <input
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            required
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
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

        {needsParentEmail && (
          <Field
            label="A parent or guardian's email"
            hint="Because you're under 13, we need a grown-up's permission before you can share games."
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
