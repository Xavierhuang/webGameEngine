import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AppNav } from '@/components/common/AppNav';
import { PageBackdrop } from '@/components/common/PageBackdrop';
import WorldTemplatePicker from '@/components/worlds/WorldTemplatePicker';
import { getTranslator } from '@/lib/i18n/server';

export default async function NewWorldPage() {
  const t = await getTranslator();
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AppNav />
      <PageBackdrop />
      <main className="relative mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-6">
        <Link href="/projects" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          {t('worlds.back')}
        </Link>
        <WorldTemplatePicker />
      </main>
    </div>
  );
}
