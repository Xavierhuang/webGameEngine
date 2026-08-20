'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/common/AuthCard';
import { useTranslator } from '@/components/common/LocaleProvider';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const t = useTranslator();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError(t('auth.login.errAccountNotFound'));
        } else {
          setError(data.error || t('auth.login.errGeneric'));
        }
        return;
      }

      if (data.success) {
        router.push('/projects');
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || t('auth.login.errNetwork'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <p className="text-sm text-slate-600">
          {t('auth.login.noAccount')}{' '}
          <Link href="/auth/signup" className="text-slate-900 font-semibold underline underline-offset-2">
            {t('auth.login.signUpLink')}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <Field label={t('auth.email')}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
            placeholder={t('auth.login.emailPlaceholder')}
          />
        </Field>

        <Field label={t('auth.password')}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-slate-900"
            placeholder={t('auth.login.passwordPlaceholder')}
          />
        </Field>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="text-right">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            {t('auth.login.forgotPassword')}
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-full font-semibold shadow-lg shadow-slate-900/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
    </AuthShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
