'use client';

import dynamic from 'next/dynamic';

/**
 * Loads the 3D showcase in the browser only.
 *
 * @react-three/fiber pulls in react-reconciler, which reads React internals
 * (ReactCurrentBatchConfig) at module evaluation. Under Next 16 those internals
 * are absent on the server, so merely *importing* the showcase crashed the
 * prerender of this page — before any component rendered.
 *
 * The editor already loads its 3D this way; this page was the one place that
 * imported a Canvas statically. It needs a client wrapper because `ssr: false`
 * is not allowed from a Server Component, and app/dragon/page.tsx is one.
 */
const DragonShowcase = dynamic(() => import('@/components/showcase/DragonShowcase'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">
      Loading the dragon…
    </div>
  ),
});

export default function DragonClient() {
  return <DragonShowcase />;
}
