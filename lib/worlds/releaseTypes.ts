import type { WorldReleaseStatus as DatabaseWorldReleaseStatus } from '@/lib/database.types';

export type WorldReleaseStatus = DatabaseWorldReleaseStatus;

function nextStates(...states: WorldReleaseStatus[]): readonly WorldReleaseStatus[] {
  return Object.freeze(states);
}

export const WORLD_RELEASE_TRANSITIONS: Readonly<Record<WorldReleaseStatus, readonly WorldReleaseStatus[]>> = Object.freeze({
  submitted: nextStates('checking', 'withdrawn'),
  checking: nextStates('review_pending', 'changes_requested', 'rejected', 'withdrawn'),
  review_pending: nextStates('published', 'changes_requested', 'rejected', 'withdrawn'),
  published: nextStates('withdrawn', 'taken_down', 'superseded'),
  changes_requested: nextStates(),
  rejected: nextStates(),
  withdrawn: nextStates(),
  taken_down: nextStates(),
  superseded: nextStates(),
});

export function canTransitionRelease(from: WorldReleaseStatus, to: WorldReleaseStatus): boolean {
  return (WORLD_RELEASE_TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminalWorldReleaseStatus(status: WorldReleaseStatus): boolean {
  return WORLD_RELEASE_TRANSITIONS[status].length === 0;
}

/**
 * Statuses in which a release still occupies its immutable snapshot — it is
 * either moving through review or currently public. Exactly one release may
 * hold a given snapshot in these states; superseded and terminal releases stay
 * as history so a creator can withdraw and resubmit the same revision.
 *
 * `migrations/015_world_release_active_snapshot.sql` enforces the same set in
 * the `active_snapshot_id` generated column. Change both together.
 */
export const WORLD_RELEASE_LIVE_STATUSES: readonly WorldReleaseStatus[] = Object.freeze([
  'submitted', 'checking', 'review_pending', 'published',
]);

export function isLiveWorldReleaseStatus(status: WorldReleaseStatus): boolean {
  return WORLD_RELEASE_LIVE_STATUSES.includes(status);
}

/** A release is public only while it is the current, approved release. */
export function isPublicWorldRelease(status: WorldReleaseStatus, currentPublic: boolean): boolean {
  return status === 'published' && currentPublic;
}

export interface PublicWorldRelease {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  templateId: string;
  genre: string | null;
  creatorLabel: string;
  publishedAt: string;
  likeCount: number;
  playCount: number;
  remixCount: number;
}
