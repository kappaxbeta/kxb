import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  forSession,
  KEEP_SIGNED_IN_COOKIE,
  keepsSignedIn,
} from '@/lib/auth-persistence'
import { env } from '@/lib/env'
import type { Database } from '@/lib/supabase/types'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Must be created per request - never hoist this into a module-level singleton,
 * or one user's session would leak into another's request.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          // The same lifetime rule the proxy applies, because a Server Action
          // that signs somebody in writes these cookies without going through
          // it. See src/lib/auth-persistence.ts.
          const keep = keepsSignedIn(cookieStore.get(KEEP_SIGNED_IN_COOKIE)?.value)

          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, keep ? options : forSession(options))
          }
        } catch {
          // Server Components cannot set cookies. That is fine: the middleware
          // refreshes the session on every request, so the rotated tokens are
          // already on their way to the browser.
        }
      },
    },
  })
}

/**
 * The signed-in user, or null.
 *
 * Uses `getUser()` rather than `getSession()` on purpose: `getSession()` trusts
 * whatever is in the cookie, while `getUser()` revalidates it against the auth
 * server. Never make an authorization decision from `getSession()`.
 */
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
