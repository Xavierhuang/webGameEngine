/**
 * Template worlds are authored directly in 3D world units. Older free-form
 * projects originated in the 2D editor and still need their legacy adapter.
 */
export interface TemplateWorldIdentity {
  templateId: string;
  templateVersion: number | string;
}

export function usesLegacyWorldCoordinates(worldIdentity?: TemplateWorldIdentity): boolean {
  return !worldIdentity;
}
