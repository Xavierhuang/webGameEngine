'use client';

import Link from 'next/link';
import { Mail, Home } from 'lucide-react';

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
          <Mail className="w-8 h-8 text-yellow-600" />
        </div>
        
        <h1 className="text-3xl font-bold text-purple-600 mb-4">
          Almost There!
        </h1>
        
        <p className="text-gray-700 mb-6">
          Your account has been created! A parent needs to approve your account before you can start creating games.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>What happens next?</strong>
            <br />
            We've sent an email to your parent. Once they approve your account, you'll be able to start creating amazing games!
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/"
            className="block w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-bold hover:from-purple-600 hover:to-pink-600 transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

