import { createHash, randomBytes, randomUUID } from 'crypto';
import { readSecurityConfig } from '../config/security';

export const GUEST_COOKIE = {
  name: 'lingplay_guest_session',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
};

export const LEGACY_GUEST_COOKIE_NAME = 'guest-profile-id';

export interface GuestSessionRow {
  sessionId: string;
  profileId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
}

export interface NewGuestSessionRow {
  sessionId: string;
  profileId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface GuestSessionStore {
  insert(row: NewGuestSessionRow): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<GuestSessionRow | null>;
  revokeByTokenHash(tokenHash: string, revokedAt: Date): Promise<void>;
  touchByTokenHash(tokenHash: string, lastSeenAt: Date): Promise<void>;
}

export interface IssuedGuestSession {
  sessionId: string;
  profileId: string;
  token: string;
  expiresAt: Date;
}

export type GuestSessionInspection =
  | { status: 'missing' | 'invalid' | 'expired' | 'revoked' }
  | { status: 'valid'; sessionId: string; profileId: string };

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueGuestSession(
  store: GuestSessionStore,
  profileId: string,
  parentToken: string | null = null,
  now = new Date()
): Promise<IssuedGuestSession> {
  if (parentToken) {
    const parentHash = hashGuestToken(parentToken);
    const parent = await store.findByTokenHash(parentHash);
    if (
      !parent ||
      parent.profileId !== profileId ||
      parent.revokedAt !== null ||
      parent.expiresAt.getTime() <= now.getTime()
    ) {
      throw new Error('Cannot rotate an invalid guest session');
    }
    await store.revokeByTokenHash(parentHash, now);
  }

  const token = randomBytes(32).toString('base64url');
  const sessionId = randomUUID();
  const sessionDays = readSecurityConfig(process.env).guestSessionDays;
  const expiresAt = new Date(now.getTime() + sessionDays * 24 * 60 * 60 * 1000);

  await store.insert({
    sessionId,
    profileId,
    tokenHash: hashGuestToken(token),
    expiresAt,
  });

  return { sessionId, profileId, token, expiresAt };
}

export async function inspectGuestToken(
  store: GuestSessionStore,
  token: string | null | undefined,
  now = new Date()
): Promise<GuestSessionInspection> {
  if (!token) return { status: 'missing' };
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { status: 'invalid' };

  const tokenHash = hashGuestToken(token);
  const row = await store.findByTokenHash(tokenHash);
  if (!row) return { status: 'invalid' };
  if (row.revokedAt !== null) return { status: 'revoked' };
  if (row.expiresAt.getTime() <= now.getTime()) return { status: 'expired' };

  await store.touchByTokenHash(tokenHash, now);
  return { status: 'valid', sessionId: row.sessionId, profileId: row.profileId };
}
