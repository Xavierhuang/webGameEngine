import type { Metadata } from 'next';
import Link from 'next/link';
import DragonShowcase from '@/components/showcase/DragonShowcase';

export const metadata: Metadata = {
  title: 'Red Metal Dragon — lingplay',
};

export default function DragonPage() {
  return (
    <main className="min-h-screen bg-[#170607] px-5 py-8 text-stone-100 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/"
          className="inline-flex rounded-full border border-red-200/20 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-200/50 hover:bg-red-200/10"
        >
          Back to lingplay
        </Link>
        <header className="mt-8 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-300">Metal-crafted asset</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">Red Metal Dragon</h1>
          <p className="mt-4 text-base leading-7 text-red-100/80 sm:text-lg">
            Pre-generated with Apple Metal and rendered interactively in the browser.
          </p>
        </header>
        <section className="mt-8" aria-label="Interactive Red Metal Dragon model">
          <DragonShowcase />
        </section>
        <p className="mt-5 text-center text-sm text-red-100/70">Drag to orbit · Scroll to zoom</p>
      </div>
    </main>
  );
}
