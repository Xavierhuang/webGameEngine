'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

/**
 * Sign out. `/api/auth/logout` has always existed but nothing called it, so
 * there was no way to leave a session from inside the product.
 */
export function SignOutButton({ label = 'Sign out' }: { label?: string } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="ml-1 rounded-full p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900 disabled:opacity-50"
      title={label}
      aria-label={label}
    >
      <LogOut className="h-3.5 w-3.5" />
    </button>
  );
}
