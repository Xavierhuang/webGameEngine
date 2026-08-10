import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/mysql/client';
import { hashPassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/jwt';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email, password, username, isParent } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const userId = randomUUID();
    await query(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      [userId, email, passwordHash]
    );

    // Profile is automatically created by trigger, but we update it with additional info
    await query(
      `UPDATE profiles 
       SET username = ?, display_name = ?, role = ?, parental_approval = ?
       WHERE user_id = ?`,
      [
        username || `user_${userId.substring(0, 8)}`,
        username || `user_${userId.substring(0, 8)}`,
        isParent ? 'parent' : 'child',
        isParent ? true : false, // Parents auto-approve themselves
        userId,
      ]
    );

    // Generate token
    const token = generateToken({
      userId,
      email,
    });

    // Set cookie
    const response = NextResponse.json({
      success: true,
      user: { id: userId, email },
    });
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}

