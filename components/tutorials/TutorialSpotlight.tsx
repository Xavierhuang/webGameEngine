'use client';

import { useEffect, useState } from 'react';
import { findTourElement, type TourAnchorQuery } from '@/lib/tutorials/tourTargets';

/**
 * Dims the editor and cuts a hole around whatever the current tutorial step is
 * talking about.
 *
 * Deliberately `pointer-events-none`. A tutorial asks a child to *do* the
 * thing — add a block, press Play — so the highlight must never be a wall
 * between them and the control. It only draws attention; every click still
 * lands where it would have.
 */
export function TutorialSpotlight({ query }: { query?: TourAnchorQuery }) {
  const rect = useAnchorRect(query);
  if (!rect) return null;

  const pad = 8;
  const hole = {
    x: Math.max(0, rect.left - pad),
    y: Math.max(0, rect.top - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };

  return (
    <div className="fixed inset-0 z-40 pointer-events-none" aria-hidden="true">
      <svg width="100%" height="100%">
        <defs>
          <mask id="lingplay-tutorial-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect {...hole} rx="14" fill="black" />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.45)"
          mask="url(#lingplay-tutorial-hole)"
        />
        {/* A ring, because the dim alone is easy to miss on a bright palette. */}
        <rect
          {...hole}
          rx="14"
          fill="none"
          stroke="rgb(251, 191, 36)"
          strokeWidth="3"
          className="animate-pulse"
        />
      </svg>
    </div>
  );
}

/**
 * The target's viewport rect, kept fresh.
 *
 * Re-measured on resize and scroll, plus a slow poll: panels here open, close
 * and re-flow from the child's own clicking, and none of that fires an event
 * this component can subscribe to. Two `getBoundingClientRect` calls a second
 * is nothing next to a Three.js scene.
 */
function useAnchorRect(query?: TourAnchorQuery): DOMRect | null {
  const key = query ? `${query.target}:${query.category ?? ''}` : '';
  // Measurement is stored with the key it belongs to, so a step change reads as
  // "not measured yet" rather than briefly showing the previous step's hole.
  // Deriving that beats clearing it from an effect.
  const [entry, setEntry] = useState<{ key: string; rect: DOMRect | null }>({ key: '', rect: null });

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const el = findTourElement(query);
      // No element means the step points at something not on screen, which
      // hides the overlay rather than stranding a hole over the wrong place —
      // the panel's text still explains the step.
      setEntry({ key, rect: el ? el.getBoundingClientRect() : null });
    };
    measure();
    const interval = window.setInterval(measure, 500);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
    // `key` collapses the query object so a new object identity each render
    // doesn't restart the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return entry.key === key && key !== '' ? entry.rect : null;
}
