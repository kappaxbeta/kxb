import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Guard for anything behind a login. Returns the user and a request-scoped
 * Supabase client, so callers do not build a second one.
 */
export async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return { user, supabase }
}
