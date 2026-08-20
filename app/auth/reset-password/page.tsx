'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { AuthShell } from '@/components/common/AuthCard';
import { useTranslator } from '@/components/common/LocaleProvider';

/** Complete a password reset from an emailed single-use link. */
function ResetPasswordForm() {
  const t = useTranslator();
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
      setError(t('auth.reset.errMismatch'));
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
        setError(data?.error || t('auth.reset.errGeneric'));
        return;
      }
      setDone(true);
    } catch {
      setError(t('auth.reset.errNetwork'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title={t('auth.reset.doneTitle')} subtitle={t('auth.reset.doneSubtitle')}>
        <button
          onClick={() => router.push('/auth/login')}
          className="w-full rounded-full bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          {t('auth.reset.doneCta')}
        </button>
      </AuthShell>
    );
  }

  if (!token) {
    return (
      <AuthShell title={t('auth.reset.missingTitle')} subtitle={t('auth.reset.missingSubtitle')}>
        <Link
          href="/auth/forgot-password"
          className="block w-full rounded-full bg-slate-900 py-3 text-center font-semibold text-white transition hover:bg-slate-800"
        >
          {t('auth.reset.missingCta')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('auth.reset.title')}
      subtitle={t('auth.reset.subtitle')}
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
          placeholder={t('auth.reset.newPasswordPlaceholder')}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-slate-900"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={t('auth.reset.confirmPlaceholder')}
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
          {loading ? t('auth.reset.submitLoading') : t('auth.reset.submit')}
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
      fallback={<ResetPasswordSuspenseFallback />}
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordSuspenseFallback() {
  const t = useTranslator();
  return (
    <AuthShell title={t('auth.forgot.title')} subtitle={t('auth.reset.suspenseSubtitle')}>
      <div className="h-24" />
    </AuthShell>
  );
}
