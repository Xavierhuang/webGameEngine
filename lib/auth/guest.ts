import { cookies } from 'next/headers';
import { query, queryOne } from '@/lib/mysql/server';
import { randomUUID } from 'crypto';
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE } from '@/lib/auth/access';

/**
 * Get or create a guest user and profile.
 *
 * This used to mint a brand-new users+profiles row on *every* call with no way
 * to reconnect the caller to it, which both leaked orphaned rows and left guest
 * projects unauthorizable (see lib/auth/access.ts). We now persist the guest's
 * profile id in a cookie and reuse it.
 */
export async function getOrCreateGuestUser(): Promise<{
  userId: string;
  profileId: string;
}> {
  const cookieStore = await cookies();
  const existingGuestId = cookieStore.get(GUEST_COOKIE)?.value;

  if (existingGuestId) {
    const existing = await queryOne<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM profiles WHERE id = ?',
      [existingGuestId]
    );
    if (existing) {
      return { userId: existing.user_id, profileId: existing.id };
    }
    // Cookie points at a profile that no longer exists — fall through and mint
    // a fresh one rather than failing the request.
  }

  const userId = randomUUID();
  const profileId = randomUUID();
  
  // Create guest user (no password, email is guest-{uuid})
  const guestEmail = `guest-${userId.substring(0, 8)}@temp.local`;
  
  try {
    await query(
      'INSERT INTO users (id, email, password_hash, email_verified) VALUES (?, ?, ?, ?)',
      [userId, guestEmail, '', false]
    );
  } catch (error: any) {
    // If user already exists (shouldn't happen with UUID), try to get it
    if (error.code === 'ER_DUP_ENTRY') {
      const existing = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = ?',
        [guestEmail]
      );
      if (existing) {
        const profile = await queryOne<{ id: string }>(
          'SELECT id FROM profiles WHERE user_id = ?',
          [existing.id]
        );
        if (profile) {
          return { userId: existing.id, profileId: profile.id };
        }
      }
    }
    throw error;
  }
  
  // Create guest profile
  try {
    await query(
      `INSERT INTO profiles (id, user_id, role, username, display_name, parental_approval)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        profileId,
        userId,
        'child',
        `Guest_${userId.substring(0, 8)}`,
        'Guest',
        false,
      ]
    );
  } catch (error: any) {
    // Profile might be created by trigger, so check if it exists
    const profile = await queryOne<{ id: string }>(
      'SELECT id FROM profiles WHERE user_id = ?',
      [userId]
    );
    if (profile) {
      await rememberGuest(profile.id);
      return { userId, profileId: profile.id };
    }
    throw error;
  }

  await rememberGuest(profileId);
  return { userId, profileId };
}

/**
 * Persist the guest's profile id so subsequent requests can be authorized as
 * the same actor. Only callable from a Route Handler / Server Action — every
 * caller of getOrCreateGuestUser is one.
 */
async function rememberGuest(profileId: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(GUEST_COOKIE, profileId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
  } catch {
    // Setting cookies throws in a Server Component render. Guest identity is
    // best-effort there; the project is still created.
  }
}

