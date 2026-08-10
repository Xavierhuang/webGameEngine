import { getPool, query, queryOne } from './client';
import { cookies } from 'next/headers';
import { verifyToken, getUserIdFromToken } from '@/lib/auth/jwt';

export { query, queryOne };

export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;

  if (!token) {
    return null;
  }

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
    }>(
      `SELECT u.id, u.email, p.username, p.display_name, p.role
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

export async function requireAuth() {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

