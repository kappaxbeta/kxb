import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronAuthorized } from '@/lib/cron-auth'

/**
 * Every guest link dies after a day, whether or not anybody remembered.
 *
 * ---------------------------------------------------------------------------
 * Why a sweep and not a column
 * ---------------------------------------------------------------------------
 * A link already carries its own `expires_at`, and that is what the door
 * enforces on every redemption - so a link with an expiry set is handled
 * without this job existing. What this catches is the link minted with *no*
 * expiry: the "open" link, which is the one people actually paste into a group
 * chat and forget about, and which otherwise stays a working front door to a
 * workspace for as long as the row exists.
 *
 * A day is chosen for what it survives rather than for tidiness: an invitation
 * sent this afternoon is opened this afternoon or this evening. One that is
 * clicked next week is one whose sender has long since stopped thinking about
 * it - and a link nobody is thinking about is exactly the link that should not
 * still open a door.
 *
 * ---------------------------------------------------------------------------
 * Revoked, not deleted
 * ---------------------------------------------------------------------------
 * `revoked_at` is what `linkProblem` reads, so setting it is the same refusal
 * an owner gets by pressing revoke, with the same words at the door. Deleting
 * the rows instead would empty the owner's list of links overnight and leave
 * them unable to see that the link they sent has lapsed - which is the one
 * thing they need to know when somebody says "your link does not work".
 *
 * Guests already inside are untouched. An admission is its own row with its own
 * clock; revoking the link they came through does not evict anybody, it only
 * stops the next person. That is deliberate - a sweep that ended visits in
 * progress would cut people out of a match at whatever hour it ran.
 *
 * Runs as the service role behind the same shared secret as the other cron
 * routes: there is no user here, and this changes access for a whole
 * installation.
 */

export const dynamic = 'force-dynamic'

/** How long a link may go on admitting people, in hours. */
const MAX_AGE_HOURS = 24

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()

  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  /**
   * Only links that are still live. `is('revoked_at', null)` is what makes this
   * idempotent: a job that ran every hour would otherwise keep rewriting the
   * revocation time of links revoked days ago, and "when was this taken back"
   * would become "when did the sweep last run".
   */
  const { data: revoked, error } = await admin
    .from('guest_links')
    .update({ revoked_at: now })
    .lt('created_at', cutoff)
    .is('revoked_at', null)
    .select('id')

  if (error) {
    return new Response(`Failed to revoke stale links: ${error.message}`, { status: 500 })
  }

  return Response.json({
    linksRevoked: revoked?.length ?? 0,
    olderThanHours: MAX_AGE_HOURS,
    cutoff,
  })
}
