import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import { ConsentForm } from '@/components/auth/ConsentForm';
import Link from 'next/link';

/**
 * The page a parent lands on from a consent link. Until a parent acts here, an
 * under-13 account cannot share or publish anything.
 */
export default async function ParentConsentPage(props: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const searchParams = await props.searchParams;
  const token = searchParams?.token ?? '';

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav />
      <PageBackdrop />
      <div className="relative mx-auto max-w-lg px-6 pb-20 pt-16">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Parental permission
        </h1>
        <p className="mt-2 leading-relaxed text-slate-600">
          Your child made an account on lingplay, a place where kids build 3D games
          with code blocks. Because they&apos;re under 13, we need your permission
          before they can share anything publicly.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-900">What you&apos;re agreeing to</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>They can publish games to the public gallery, where others can play and remix them.</li>
            <li>We store their username, age, and the games they make.</li>
            <li>There is no open chat between kids.</li>
            <li>You can withdraw permission at any time by contacting us.</li>
          </ul>
          <p className="mt-3">
            Full details in our{' '}
            <Link href="/privacy" className="font-semibold underline">
              privacy policy
            </Link>
            .
          </p>
        </div>

        {token ? (
          <ConsentForm token={token} />
        ) : (
          <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            This link is missing its permission code. Please open the full link
            we emailed you — links expire after 24 hours and can be resent from
            your child&apos;s pending-approval page.
          </p>
        )}
      </div>
    </div>
  );
}
