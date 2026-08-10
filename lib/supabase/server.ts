import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/lib/database.types';

export const createServerClient = () => {
  return createServerComponentClient<Database>({ cookies });
};

