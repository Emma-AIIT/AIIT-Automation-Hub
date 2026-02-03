import { createClient } from '@supabase/supabase-js'

/**
 * Admin Supabase client that uses the service_role key.
 * Does NOT use cookies - avoids session override that can block admin operations (e.g. DELETE).
 * Use for server-side operations that must bypass RLS.
 */
export const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.'
    )
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}
