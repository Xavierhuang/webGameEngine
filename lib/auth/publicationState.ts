export interface ProjectModerationBadge {
  bg: string;
  label: string;
}

export function isPublishedProject(status: string | null | undefined): boolean {
  return status === 'published';
}

export function getProjectModerationBadge(
  status: string | null | undefined,
  visibility: string | null | undefined
): ProjectModerationBadge | null {
  if (visibility === 'private' || isPublishedProject(status)) return null;
  if (status === 'moderation_pending') {
    return { bg: 'bg-amber-500', label: 'Pending review' };
  }
  if (status === 'rejected') {
    return { bg: 'bg-red-500', label: 'Removed' };
  }
  return { bg: 'bg-slate-500', label: 'Draft' };
}
