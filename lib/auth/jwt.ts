import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];

// Resolved lazily, not at module load: `next build` imports this module with
// NODE_ENV=production, and we don't want a missing env var to break the build —
// only to break actual token signing/verification at runtime.
let devSecret: string | null = null;

function getSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) return fromEnv;

  // Never silently fall back in production. The old behaviour generated a random
  // per-process secret, which meant every restart invalidated all sessions and
  // multiple replicas rejected each other's tokens — with no error anywhere.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is not set. Refusing to sign or verify tokens with a generated secret in production.'
    );
  }

  if (!devSecret) {
    devSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[auth] JWT_SECRET unset — using a random development secret. Sessions reset on restart.');
  }
  return devSecret;
}

export interface JWTPayload {
  userId: string;
  email: string;
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function getUserIdFromToken(token: string): string | null {
  const payload = verifyToken(token);
  return payload?.userId || null;
}

