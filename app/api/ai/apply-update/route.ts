import { NextRequest, NextResponse } from 'next/server';
import { readFeatureFlag } from '@/lib/safety/featureFlags';

/**
 * AI apply-update route.
 *
 * Task 4 disables this route unconditionally behind the `ai_mutation`
 * feature flag. The previous implementation was ~500 lines of ad-hoc AI
 * batch ingestion writing directly to `game_objects` and `logic_blocks`
 * with no revision fence, no idempotency, and no consent gate — which is
 * exactly why the plan flagged it for a full rewrite alongside the other
 * AI surfaces.
 *
 * Task 7 (Guard and Bound Every AI Surface) owns the replacement: strict
 * discriminated command union, ordered access/consent/budget guards, and
 * translation into `ProjectCommand`s dispatched through the command
 * service. Until that lands, this route returns 503 `feature_unavailable`
 * so an operator toggle cannot accidentally re-enable the legacy path.
 *
 * The `ai_mutation` flag is defaulted-disabled in production by
 * `readFeatureFlag`; even a development machine that sets it true still
 * gets 503 because the translation layer does not exist yet.
 */
export async function POST(_request: NextRequest) {
  const flag = readFeatureFlag('creation_ai');
  return NextResponse.json(
    {
      error: 'feature_unavailable',
      reason: flag.reason,
      message:
        'AI mutation is disabled pending Task 7 (Guard and Bound Every AI Surface). ' +
        'The legacy apply-update path has been retired; use the command service directly.',
    },
    { status: 503 },
  );
}
