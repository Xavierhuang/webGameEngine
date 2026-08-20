import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import Link from 'next/link';
import { getTranslator } from '@/lib/i18n/server';

export const metadata = {
  title: 'Privacy policy — lingplay',
};

/**
 * Privacy policy. Required for a COPPA programme and referenced from the
 * parental-consent flow; the product previously had no privacy page at all.
 */
export default async function PrivacyPage() {
  const t = await getTranslator();
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav />
      <PageBackdrop />
      <div className="relative mx-auto max-w-2xl px-6 pb-24 pt-12">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">{t('privacy.title')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('privacy.forWhom')}</p>

        <div className="mt-8 space-y-8 leading-relaxed text-slate-700">
          <Section title={t('privacy.who.title')}>
            <p>{t('privacy.who.body')}</p>
          </Section>

          <Section title={t('privacy.collect.title')}>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>{t('privacy.collect.email')}</li>
              <li>{t('privacy.collect.username')}</li>
              <li>{t('privacy.collect.dob')}</li>
              <li>{t('privacy.collect.parentEmail')}</li>
              <li>{t('privacy.collect.games')}</li>
            </ul>
          </Section>

          <Section title={t('privacy.dont.title')}>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>{t('privacy.dont.chat')}</li>
              <li>{t('privacy.dont.sell')}</li>
              <li>{t('privacy.dont.overCollect')}</li>
            </ul>
          </Section>

          <Section title={t('privacy.ai.title')}>
            <p>{t('privacy.ai.body')}</p>
          </Section>

          <Section title={t('privacy.rights.title')}>
            <p>{t('privacy.rights.body')}</p>
            <p className="mt-2">
              {t('privacy.rights.contact')}{' '}
              <a href="mailto:privacy@lingcode.dev" className="font-semibold underline">
                privacy@lingcode.dev
              </a>
              .
            </p>
          </Section>

          <Section title={t('privacy.retention.title')}>
            <p>{t('privacy.retention.body')}</p>
          </Section>
        </div>

        <p className="mt-12 text-xs leading-relaxed text-slate-500">
          {t('privacy.disclaimer')}
        </p>

        <Link href="/" className="mt-8 inline-block text-sm font-semibold text-slate-700 underline">
          {t('privacy.back')}
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
