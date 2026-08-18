import { query, queryOne } from './client';
import { cookies } from 'next/headers';
import { getUserIdFromToken } from '../auth/jwt';
import type { GuestSessionRow, GuestSessionStore } from '../auth/guestSession';
import type { Database } from '../database.types';

export { query, queryOne };

export async function getAuthenticatedUserFromToken(token: string) {
  try {
    const userId = getUserIdFromToken(token);
    if (!userId) {
      return null;
    }

    const user = await queryOne<{
      id: string;
      email: string;
      username: string | null;
      display_name: string | null;
      role: string;
      profile_id: string | null;
    }>(
      `SELECT u.id, u.email, p.username, p.display_name, p.role, p.id AS profile_id
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
      [userId]
    );

    return user;
  } catch (error) {
    console.error('[auth] getAuthenticatedUser failed:', error);
    return null;
  }
}

export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  return token ? getAuthenticatedUserFromToken(token) : null;
}

type GuestSessionSchemaRow = Database['public']['Tables']['guest_sessions']['Row'];
type GuestSessionDatabaseRow = Pick<
  GuestSessionSchemaRow,
  'id' | 'profile_id' | 'token_hash'
> & {
  expires_at: Date | string;
  revoked_at: Date | string | null;
  last_seen_at: Date | string | null;
};

const asDate = (value: Date | string): Date => value instanceof Date ? value : new Date(value);

export const guestSessionStore: GuestSessionStore = {
  async insert(row) {
    await query(
      `INSERT INTO guest_sessions (id, profile_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [row.sessionId, row.profileId, row.tokenHash, row.expiresAt]
    );
  },
  async findByTokenHash(tokenHash) {
    const row = await queryOne<GuestSessionDatabaseRow>(
      `SELECT id, profile_id, token_hash, expires_at, revoked_at, last_seen_at
       FROM guest_sessions WHERE token_hash = ?`,
      [tokenHash]
    );
    if (!row) return null;
    return {
      sessionId: row.id,
      profileId: row.profile_id,
      tokenHash: row.token_hash,
      expiresAt: asDate(row.expires_at),
      revokedAt: row.revoked_at === null ? null : asDate(row.revoked_at),
      lastSeenAt: row.last_seen_at === null ? null : asDate(row.last_seen_at),
    } satisfies GuestSessionRow;
  },
  async revokeByTokenHash(tokenHash, revokedAt) {
    await query(
      'UPDATE guest_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
      [revokedAt, tokenHash]
    );
  },
  async touchByTokenHash(tokenHash, lastSeenAt) {
    await query(
      `UPDATE guest_sessions SET last_seen_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
      [lastSeenAt, tokenHash, lastSeenAt]
    );
  },
};

export async function requireAuth() {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
