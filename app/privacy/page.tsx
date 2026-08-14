import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy policy — lingplay',
};

/**
 * Privacy policy. Required for a COPPA programme and referenced from the
 * parental-consent flow; the product previously had no privacy page at all.
 */
export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav />
      <PageBackdrop />
      <div className="relative mx-auto max-w-2xl px-6 pb-24 pt-12">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Privacy policy</h1>
        <p className="mt-2 text-sm text-slate-500">For parents, guardians, and teachers.</p>

        <div className="mt-8 space-y-8 leading-relaxed text-slate-700">
          <Section title="Who this is for">
            <p>
              lingplay is a place where children build 3D games using code blocks.
              Because we know children under 13 use it, we follow the US Children&apos;s
              Online Privacy Protection Act (COPPA) and ask for a parent&apos;s
              permission before an under-13 account can share anything publicly.
            </p>
          </Section>

          <Section title="What we collect">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Email address</strong> — to sign in and recover the account.</li>
              <li><strong>Username and display name</strong> — shown on shared games.</li>
              <li><strong>Date of birth</strong> — used only to work out an age band, so we know whether parental permission is needed and how strictly to filter content. We store the age, not a marketing profile.</li>
              <li><strong>A parent or guardian&apos;s email</strong>, for under-13 accounts, used solely to request permission.</li>
              <li><strong>The games they make</strong> — scenes, characters, scripts, and any files they upload.</li>
            </ul>
          </Section>

          <Section title="What we don't do">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>There is no open chat between children.</li>
              <li>We don&apos;t sell personal information, and we don&apos;t run behavioural advertising.</li>
              <li>We don&apos;t require a child to disclose more than is reasonably necessary to use the product.</li>
            </ul>
          </Section>

          <Section title="AI features">
            <p>
              Some features send what a child types to an AI model to generate
              characters or answer questions in a game. Both what is sent and what
              comes back are screened for unsafe content. Don&apos;t enter personal
              details into these prompts.
            </p>
          </Section>

          <Section title="Parental rights">
            <p>
              As a parent or guardian you can review the personal information we
              hold about your child, ask us to delete it, and withdraw permission
              at any time — after which the account stops sharing publicly. Deleting
              an account removes its projects, scenes, objects, scripts, and uploads.
            </p>
            <p className="mt-2">
              To make any of these requests, contact us at{' '}
              <a href="mailto:privacy@lingcode.dev" className="font-semibold underline">
                privacy@lingcode.dev
              </a>
              .
            </p>
          </Section>

          <Section title="Data retention">
            <p>
              We keep a project for as long as the account exists. Consent links
              expire after 14 days. Moderation records are kept so we can act on
              repeat problems.
            </p>
          </Section>
        </div>

        <p className="mt-12 text-xs leading-relaxed text-slate-500">
          This page describes how the product currently behaves. It is not legal
          advice — if you operate this service, have counsel review it against
          COPPA, GDPR-K, and any local requirements before launch.
        </p>

        <Link href="/" className="mt-8 inline-block text-sm font-semibold text-slate-700 underline">
          Back to lingplay
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
