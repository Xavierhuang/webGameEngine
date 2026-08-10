'use client';

export function setAuthToken(token: string) {
  document.cookie = `auth-token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export function removeAuthToken() {
  document.cookie = 'auth-token=; path=/; max-age=0';
}

export function getAuthToken(): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  const tokenCookie = cookies.find((c) => c.trim().startsWith('auth-token='));
  return tokenCookie ? tokenCookie.split('=')[1] : null;
}

