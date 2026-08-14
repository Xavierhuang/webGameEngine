/**
 * Project access rules — pure, with no imports.
 *
 * Kept free of `next/headers` and the MySQL client (unlike lib/auth/access.ts,
 * which wires these rules to a request) so node tests can require it directly.
 * Same convention as lib/blockly/definitions.ts and lib/safety/keyword-scan.ts.
 */

export interface ProjectRow {
  owner_id: string;
  visibility?: string | null;
  moderation_status?: string | null;
}

export interface ProjectAccess {
  canView: boolean;
  canEdit: boolean;
  isOwner: boolean;
}

/**
 * Editing is owner-only — note that `visibility === 'public'` must never grant
 * write access. Viewing is owner-or-public, and "public" additionally requires
 * the project to have cleared moderation, so a `rejected` project is not
 * readable by strangers even when its visibility flag says public.
 *
 * `actorProfileId` is null for callers we can't identify; they get neither
 * ownership nor edit rights, and can only see approved public projects.
 */
export function decideAccess(
  project: ProjectRow,
  actorProfileId: string | null
): ProjectAccess {
  const isOwner = actorProfileId !== null && project.owner_id === actorProfileId;

  const publiclyVisible =
    project.visibility === 'public' && project.moderation_status !== 'rejected';

  return {
    isOwner,
    canEdit: isOwner,
    canView: isOwner || publiclyVisible,
  };
}
