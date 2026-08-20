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
        throw new Error(data.error || t('auth.signup.errGeneric'));
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
      let errorMessage = err.message || t('auth.signup.errFallback');
      if (errorMessage.includes('rate limit') || errorMessage.includes('429') || err.status === 429) {
        errorMessage = t('auth.signup.errRateLimit');
      } else if (errorMessage.includes('already registered')) {
        errorMessage = t('auth.signup.errAlreadyRegistered');
      } else if (errorMessage.includes('password')) {
        errorMessage = t('auth.signup.errPassword');
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.signup.title')}
      subtitle={t('auth.signup.subtitle')}
      footer={
        <p className="text-sm text-slate-600">
          {t('auth.signup.haveAccount')}{' '}
          <Link href="/auth/login" className="text-slate-900 font-semibold underline underline-offset-2">
            {t('auth.signup.signInLink')}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSignUp} className="space-y-4">
        <Field label={t('auth.signup.usernameLabel')}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
            placeholder={t('auth.signup.usernamePlaceholder')}
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
            placeholder={t('auth.signup.emailPlaceholder')}
          />
        </Field>

        <Field label={t('auth.signup.passwordLabel')} hint={t('auth.signup.passwordHint')}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
            placeholder={t('auth.signup.passwordPlaceholder')}
          />
        </Field>

        <Field label={t('auth.signup.dobLabel')} hint={t('auth.signup.dobHint')}>
          <input
            type="date"
            aria-label={t('auth.signup.dobLabel')}
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            required
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
          />
        </Field>

        {needsParentEmail && (
          <Field
            label={t('auth.signup.parentEmailLabel')}
            hint={t('auth.signup.parentEmailHint')}
          >
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
              placeholder={t('auth.signup.parentEmailPlaceholder')}
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
          <strong className="font-semibold text-slate-800">{t('auth.signup.parentPromptLabel')}</strong>{' '}
          <Link href="/auth/parent-enrollment" className="text-slate-900 underline underline-offset-2 font-semibold">
            {t('auth.signup.parentPromptLink')}
          </Link>{' '}
          {t('auth.signup.parentPromptSuffix')}
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
