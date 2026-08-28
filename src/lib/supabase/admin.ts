import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

/**
 * Server-only Supabase client initialized with the Service Role key.
 * Bypasses RLS for system tasks, cron jobs, and public showcase rendering.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    env.supabaseUrl(),
    env.supabaseServiceRoleKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}
