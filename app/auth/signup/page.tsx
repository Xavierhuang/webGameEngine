'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isParent, setIsParent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        email,
        password,
            username,
          isParent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Account creation failed. Please try again.');
      }

      if (data.success) {
      // Success! Redirect to projects (children can log in immediately)
      // They'll have limited features until parent approval
      router.push('/projects?signup=success');
      }
    } catch (err: any) {
      // Handle rate limiting and other errors
      let errorMessage = err.message || 'Something went wrong';
      
      // Make rate limit errors more user-friendly
      if (errorMessage.includes('rate limit') || errorMessage.includes('after') || errorMessage.includes('429') || err.status === 429) {
        errorMessage = 'Too many signup attempts. Please wait 60 seconds and try again.';
      } else if (errorMessage.includes('already registered') || errorMessage.includes('already been registered')) {
        errorMessage = 'This email is already registered. Try signing in instead.';
      } else if (errorMessage.includes('password')) {
        errorMessage = 'Password must be at least 6 characters long.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-purple-600 mb-2">
            Create Account
          </h1>
          <p className="text-gray-600">Start creating amazing games!</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Choose a fun username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="At least 6 characters"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isParent"
              checked={isParent}
              onChange={(e) => setIsParent(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <label htmlFor="isParent" className="text-sm text-gray-700">
              I am a parent creating an account
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-bold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-purple-600 font-medium hover:underline">
              Sign In
            </Link>
          </p>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>For Parents:</strong> After signing up, you can add your child's account and set up parental controls.
          </p>
        </div>
      </div>
    </div>
  );
}

