import { cookies } from 'next/headers';
import { getUserIdFromToken } from './jwt';
import {
  GUEST_COOKIE,
  inspectGuestToken,
  type GuestSessionInspection,
} from './guestSession';
import { guestSessionStore, queryOne } from '../mysql/server';

export interface UserActor {
  kind: 'user';
  userId: string;
  profileId: string;
}

export interface GuestActor {
  kind: 'guest';
  sessionId: string;
  profileId: string;
}

export interface AnonymousActor {
  kind: 'anonymous';
}

export type Actor = UserActor | GuestActor | AnonymousActor;

interface ActorCredentials {
  userId: string | null;
  guestProfileId: string | null;
  guestSessionId?: string | null;
}

export interface ActorResolverDependencies {
  getUserIdFromToken(token: string): string | null;
  findUserProfileId(userId: string): Promise<string | null>;
  inspectGuestToken(token: string | null | undefined): Promise<GuestSessionInspection>;
}

function readRequestCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function createActorResolver(dependencies: ActorResolverDependencies) {
  async function resolveActorFromCredentials(credentials: ActorCredentials): Promise<Actor> {
    if (credentials.userId) {
      const profileId = await dependencies.findUserProfileId(credentials.userId);
      return profileId
        ? { kind: 'user', userId: credentials.userId, profileId }
        : { kind: 'anonymous' };
    }

    if (credentials.guestProfileId && credentials.guestSessionId) {
      return {
        kind: 'guest',
        sessionId: credentials.guestSessionId,
        profileId: credentials.guestProfileId,
      };
    }

    return { kind: 'anonymous' };
  }

  async function resolveActorFromCookieValues(
    authToken: string | null,
    guestToken: string | null
  ): Promise<Actor> {
    const userId = authToken ? dependencies.getUserIdFromToken(authToken) : null;
    if (userId) {
      return resolveActorFromCredentials({ userId, guestProfileId: null });
    }

    if (!guestToken) return { kind: 'anonymous' };
    const guest = await dependencies.inspectGuestToken(guestToken);
    return resolveActorFromCredentials({
      userId: null,
      guestProfileId: guest.status === 'valid' ? guest.profileId : null,
      guestSessionId: guest.status === 'valid' ? guest.sessionId : null,
    });
  }

  async function resolveActor(request: Request): Promise<Actor> {
    return resolveActorFromCookieValues(
      readRequestCookie(request, 'auth-token'),
      readRequestCookie(request, GUEST_COOKIE.name)
    );
  }

  async function inspectGuestSessionForClaim(
    request: Request
  ): Promise<GuestSessionInspection> {
    const guestToken = readRequestCookie(request, GUEST_COOKIE.name);
    return guestToken ? dependencies.inspectGuestToken(guestToken) : { status: 'missing' };
  }

  return {
    resolveActor,
    resolveActorFromCookieValues,
    resolveActorFromCredentials,
    inspectGuestSessionForClaim,
  };
}

const defaultResolver = createActorResolver({
  getUserIdFromToken,
  async findUserProfileId(userId) {
    const profile = await queryOne<{ id: string }>(
      `SELECT p.id
       FROM profiles p
       INNER JOIN users u ON u.id = p.user_id
       WHERE u.id = ? AND p.profile_kind = 'user'`,
      [userId]
    );
    return profile?.id ?? null;
  },
  inspectGuestToken(token) {
    return inspectGuestToken(guestSessionStore, token);
  },
});

export const resolveActor = defaultResolver.resolveActor;
export const inspectGuestSessionForClaim = defaultResolver.inspectGuestSessionForClaim;

export async function resolveCurrentActor(): Promise<Actor> {
  const cookieStore = await cookies();
  return defaultResolver.resolveActorFromCookieValues(
    cookieStore.get('auth-token')?.value ?? null,
    cookieStore.get(GUEST_COOKIE.name)?.value ?? null
  );
}
