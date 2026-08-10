'use client';

import Link from 'next/link';
import { Home, Mail } from 'lucide-react';
import { AuthShell } from '@/components/common/AuthCard';

export default function PendingApprovalPage() {
  return (
    <AuthShell
      title="Almost there"
      subtitle="Your account is created. A parent needs to approve it before you can share games."
      icon={
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 text-amber-700">
          <Mail className="w-6 h-6" />
        </span>
      }
    >
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
        <strong className="font-semibold text-slate-900 block mb-1">What happens next?</strong>
        We&apos;ve emailed your parent. Once they approve, you can start building without limits.
        Until then, you can still explore the editor.
      </div>

      <div className="mt-6 space-y-2">
        <Link
          href="/"
          className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-full font-semibold shadow-lg shadow-slate-900/10 transition"
        >
          <Home className="w-4 h-4" />
          Go home
        </Link>
        <Link
          href="/projects"
          className="w-full inline-flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 py-3 rounded-full font-semibold transition"
        >
          Try the editor anyway
        </Link>
      </div>
    </AuthShell>
  );
}
