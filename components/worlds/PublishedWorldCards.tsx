import Link from 'next/link';
import { Play } from 'lucide-react';
import type { PublicWorldRelease } from '@/lib/worlds/releaseTypes';

interface PublishedWorldCardsProps {
  releases: PublicWorldRelease[];
}

/**
 * Approved world releases on Explore, rendered as their own section rather than
 * merged into the legacy public-project grid.
 *
 * Every field here comes from `toPublicWorldRelease`, whose allowlist already
 * excludes release status, `current_public`, owner identity, and the submission
 * key. Nothing on this card is derived from the mutable project row except the
 * three social counters that were already public.
 */
export default function PublishedWorldCards({ releases }: PublishedWorldCardsProps) {
  if (releases.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Worlds from the community
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {releases.map((release) => (
          <Link
            key={release.id}
            href={`/worlds/${release.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300"
          >
            <div className="aspect-video w-full bg-slate-100">
              {release.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={release.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="font-bold text-slate-900">{release.title}</h3>
              <p className="mt-0.5 text-xs text-slate-500">by {release.creatorLabel}</p>
              {release.description && (
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{release.description}</p>
              )}
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
                <Play className="h-4 w-4" /> Play
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
