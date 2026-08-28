import { NextResponse } from 'next/server'
import { pageViewFrom } from '@/domain/analytics/track'
import { isRegistrationOpen } from '@/domain/flags/queries'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getUser } from '@/lib/supabase/server'

/**
 * The demo's way out: count the click, then send them to the right door.
 *
 * A route rather than a `<Link href="/signup">` with a beacon on it, and that
 * is the whole design. The question being asked is "how many people who walk
 * around the demo then ask to join", and a click handler answers it only for
 * visitors whose JavaScript ran, whose beacon was not blocked, and who did not
 * middle-click. A navigation the server has to serve is counted once, for
 * everybody, on the same request that acts on it - there is no version of this
 * where the redirect happens and the count does not.
 *
 * Nothing new is stored: this writes the row `page_views` already holds, on a
 * path that only this handler ever produces. So the answer shows up in the
 * backoffice's own Pages report next to every other path, with the visitor
 * count, the country and the source already computed the way traffic is
 * computed everywhere else - no second table, no second report, no second
 * definition of "a person".
 *
 * The two doors are the same pair the landing page picks between, read from the
 * same flag, because an installation that is invitation-only must not send
 * somebody from the demo into a signup form that will refuse them.
 */

/** The path the click is filed under. Never rendered; only ever counted. */
const DEMO_JOIN_PATH = '/demo/join'

export async function GET(request: Request) {
  const supabase = await createClient()

  /**
   * The flag first, and the count after.
   *
   * If the flag lookup throws, the visitor still gets a door - `isRegistrationOpen`
   * has its own fallback - and if the insert fails they get one anyway. The
   * redirect is the thing that must not depend on anything, which is why it is
   * built from a value that cannot fail and returned outside every try.
   */
  const open = await isRegistrationOpen(supabase).catch(() => false)

  /**
   * Built from NEXT_PUBLIC_APP_URL, not `request.url`, for the reason spelled
   * out in /auth/callback: behind Caddy the app is a standalone Next server
   * bound to 0.0.0.0:3000, and a redirect resolved against the request lands
   * the visitor on `http://0.0.0.0:3000/signup` - which is not a place a
   * browser can go.
   */
  const destination = new URL(open ? '/signup' : '/waitlist', env.appUrl())

  /**
   * Attributed to whoever is signed in, if anybody is - which is nearly never
   * here, because the demo is for people who have no account. `pageViewFrom`
   * takes the id rather than looking it up, so the null case costs nothing.
   */
  const user = await getUser().catch(() => null)

  const row = pageViewFrom(
    {
      path: DEMO_JOIN_PATH,
      // The demo page itself, on our own host, which `referrerHost` correctly
      // reads as "not a source" and files as direct. What is worth keeping is
      // the first-touch source of the session, and the visit to /demo already
      // carries it.
      referrer: request.headers.get('referer'),
      /**
       * The `?src=` the demo page hands on when it was reached with one.
       *
       * Without it this row is filed as direct and the report can say how many
       * people asked to join but not which post they came in from - which is
       * the number the whole tag exists to produce. The demo's own link is what
       * carries it this far; see the join button in `../demo-lounge.tsx`.
       */
      search: new URL(request.url).search,
      userId: user?.id ?? null,
    },
    request.headers,
  )

  if (row) {
    const { error } = await createAdminClient().from('page_views').insert(row)
    if (error) {
      // Logged, never thrown. Losing one click from the report is cheaper than
      // a 500 in front of somebody who was on their way to sign up.
      console.error('demo join click insert failed:', error.message)
    }
  }

  return NextResponse.redirect(destination)
}
