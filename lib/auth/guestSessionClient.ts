'use client';

export async function ensureGuestSession(): Promise<void> {
  const response = await fetch('/api/guest-session', { method: 'POST' });
  if (!response.ok) {
    throw new Error('Could not start your session. Try again.');
  }
}
