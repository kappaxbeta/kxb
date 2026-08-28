import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

/**
 * Supabase client for Client Components.
 *
 * Session tokens live in cookies (not localStorage) so the server can read them
 * during SSR - that is the whole point of using `@supabase/ssr` here.
 */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl(), env.supabaseAnonKey())
}
