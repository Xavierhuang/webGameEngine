export interface PublicProjectSource {
  id: string;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  genre?: string | null;
  created_at: Date | string;
  updated_at?: Date | string | null;
  play_count?: number;
  like_count?: number;
  remix_count?: number;
  remixed_from?: string | null;
  visibility?: string | null;
  moderation_status?: string | null;
}

export interface PublicAuthorSource {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface PublicProjectDto {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  genre: string | null;
  created_at: Date | string;
  updated_at: Date | string | null;
  play_count: number;
  like_count: number;
  remix_count: number;
  remixed_from: string | null;
  visibility: string | null;
  moderation_status: string | null;
  author: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

/** Explicit allow-list; authority and moderation-note fields cannot pass through. */
export function toPublicProjectDto(
  project: PublicProjectSource,
  author: PublicAuthorSource
): PublicProjectDto {
  return {
    id: project.id,
    title: project.title,
    description: project.description ?? null,
    thumbnail_url: project.thumbnail_url ?? null,
    genre: project.genre ?? null,
    created_at: project.created_at,
    updated_at: project.updated_at ?? null,
    play_count: project.play_count ?? 0,
    like_count: project.like_count ?? 0,
    remix_count: project.remix_count ?? 0,
    remixed_from: project.remixed_from ?? null,
    visibility: project.visibility ?? null,
    moderation_status: project.moderation_status ?? null,
    author: {
      username: author.username ?? null,
      display_name: author.display_name ?? null,
      avatar_url: author.avatar_url ?? null,
    },
  };
}
