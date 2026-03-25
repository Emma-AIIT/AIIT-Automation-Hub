/**
 * Browser-side Supabase client factory using the public anon key.
 * Use this in Client Components (`'use client'`) where cookie-based auth is not required.
 */
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}