import { toPublicProjectDto, type PublicProjectDto } from './publicProjectDto';

export interface PublicProjectListItem extends PublicProjectDto {
  parent: { id: string; title: string } | null;
}

export interface PublicProjectListRow {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  genre: string | null;
  created_at: Date;
  updated_at: Date;
  play_count: number;
  like_count: number;
  remix_count: number;
  remixed_from: string | null;
  visibility: string;
  moderation_status: string;
  author_username: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  parent_id: string | null;
  parent_title: string | null;
}

/** Hide lineage unless the qualified parent join proved that parent public. */
export function toPublicProjectListItem(row: PublicProjectListRow): PublicProjectListItem {
  const visibleParent = row.parent_id && row.parent_title
    ? { id: row.parent_id, title: row.parent_title }
    : null;

  return {
    ...toPublicProjectDto(
      { ...row, remixed_from: visibleParent?.id ?? null },
      {
        username: row.author_username,
        display_name: row.author_name,
        avatar_url: row.author_avatar_url,
      }
    ),
    parent: visibleParent,
  };
}
