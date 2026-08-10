import { query, queryOne } from '@/lib/mysql/server';
import { randomUUID } from 'crypto';

/**
 * Get or create a guest user and profile
 * Guest users are temporary and can be converted to real accounts later
 */
export async function getOrCreateGuestUser(): Promise<{
  userId: string;
  profileId: string;
}> {
  // Check if there's a guest user in the session/cookie
  // For now, we'll create a new guest user each time
  // In production, you might want to store guest ID in localStorage/cookie
  
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
      return { userId, profileId: profile.id };
    }
    throw error;
  }
  
  return { userId, profileId };
}

