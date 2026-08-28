import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * "Is anybody signed in", answered in a shape a script can read.
 *
 * The rest of the app reaches for `requireUser()`, which `redirect('/login')`s.
 * That is right for a page and wrong here: in a route handler a redirect is a
 * 307, so a caller with no session receives a login *page* with a 3xx in front
 * of it, and a client that follows redirects by default - curl -L, fetch, most
 * HTTP libraries - reports success and hands back HTML. The failure then
 * surfaces wherever that HTML is parsed as JSON, which is nowhere near the
 * cause.
 *
 * So this returns the refusal instead of throwing it, and the caller returns
 * that response. 401 with a body, no redirect.
 *
 * It answers only "is there a session". Whether that session may do the thing
 * is still settled downstream by `requireBackofficeAdmin`, `requireTenant` and
 * row level security - all of which 404 rather than refuse, deliberately, so
 * that a surface somebody is probing for is not confirmed to exist. The
 * distinction is worth keeping: 401 means "say who you are", 404 means "there
 * is nothing here for you", and only the first is worth retrying with
 * credentials.
 */
export type ApiUser =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; response: NextResponse }

export async function requireApiUser(): Promise<ApiUser> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Sign in first. This endpoint reads the session cookie.' },
        { status: 401 },
      ),
    }
  }

  return { ok: true, supabase }
}
