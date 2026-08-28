import type { NextRequest } from 'next/server'
import { reapOrphanedGuests } from '@/domain/guests/orphans'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronAuthorized } from '@/lib/cron-auth'

/**
 * Sweeping up after guests.
 *
 * ---------------------------------------------------------------------------
 * This is housekeeping, not enforcement
 * ---------------------------------------------------------------------------
 * Worth stating plainly, because a job named "reap" reads like a security
 * control and this one is not. A guest's admission expires by the clock, and
 * `tenant_role()` checks that clock on every single query - so an expired guest
 * stops being able to do anything the instant they expire, whether or not this
 * endpoint has ever run. A deployment that never schedules it is not less safe,
 * only untidier.
 *
 * What it actually buys is two things:
 *
 *   1. `tenant_guests` stops growing without bound.
 *   2. The anonymous `auth.users` rows behind those guests go away. Those are
 *      the real litter - a guest link that has a good week leaves a permanent
 *      account per visitor, and the only other thing that deletes one is a
 *      visitor pressing "leave" themselves, which most never do.
 *
 * ---------------------------------------------------------------------------
 * Order matters
 * ---------------------------------------------------------------------------
 * The guest rows are read *before* they are deleted, because they are the only
 * record of which anonymous users were guests. Delete them first and the
 * auth.users rows become unattributable - indistinguishable from any other
 * anonymous account - and there is no second chance to work it out.
 *
 * Runs as the service role behind a shared secret, for the same reason the
 * entitlement sync does: there is no user here, and it can delete accounts.
 */

export const dynamic = 'force-dynamic'

/**
 * How long an expired admission is left alone before it is swept.
 *
 * Not zero, deliberately. A guest whose pass lapsed ten seconds ago may be
 * mid-reconnect, and deleting the row out from under them turns a clean "your
 * visit has ended" into a socket dying for no stated reason. An hour is far
 * longer than any reconnect and far shorter than anybody cares about.
 */
const GRACE = '1 hour'

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()

  // Who is about to be swept. Read first - see the note above.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data: stale, error: readError } = await admin
    .from('tenant_guests')
    .select('guest_id')
    .lt('expires_at', cutoff)

  if (readError) {
    return new Response(`Failed to read expired guests: ${readError.message}`, {
      status: 500,
    })
  }

  const guestIds = [...new Set((stale ?? []).map((row) => row.guest_id))]

  // The rows themselves, through the function rather than a delete here, so the
  // grace period is defined in one place and the SQL is what the migration
  // documents.
  const { data: removed, error: reapError } = await admin.rpc('reap_expired_guests', {
    p_grace: GRACE,
  })

  if (reapError) {
    return new Response(`Failed to reap guests: ${reapError.message}`, { status: 500 })
  }

  // ---------------------------------------------------------------------------
  // And the ones there was nothing left to name
  // ---------------------------------------------------------------------------
  // The sweep above can only collect accounts whose rows it read on the way
  // past, which quietly meant it collected almost none of them. An admission
  // that is *revoked*, ejected, or ended by the guest leaves no expired row to
  // find, so its account was never a candidate and stayed in `auth.users`
  // forever - twelve of them on the production box when this was written, the
  // oldest three days old, with the job running hourly the whole time.
  //
  // So the question is asked the other way round as well: of the anonymous
  // accounts that exist, which have no admission at all? That catches every
  // path out of a visit rather than the one that happens to leave a trail.
  //
  // Old enough to have missed the door, deliberately. `enterAsGuest` creates
  // the account a moment before it writes the row, and an account swept in that
  // gap would be somebody's visit ending as it began.
  const strays = await listStrayGuests(admin, cutoff)

  // ---------------------------------------------------------------------------
  // Then the accounts
  // ---------------------------------------------------------------------------
  // Through `reapOrphanedGuests`, which is the same collector every button in
  // the app hands ids to. It was a copy of this loop with one extra check -
  // "does this id still hold an admission somewhere" - and the copy without it
  // was wrong: a guest admitted to two spaces whose first pass expired would
  // have had their account deleted out from under the second, mid-visit.
  //
  // It also makes the "only ever anonymous accounts" guard once rather than
  // twice. That guard is not paranoia: `guest_id` has no foreign key - which is
  // what lets a guest exist without an account at all - so nothing at the
  // database level stops a stray value from naming a real member's id.
  const candidates = [...new Set([...guestIds, ...strays])]
  const deletedUsers = await reapOrphanedGuests(candidates)

  return Response.json({
    admissionsRemoved: removed ?? 0,
    /** Accounts considered: swept rows plus anonymous accounts with no row. */
    candidates: candidates.length,
    usersDeleted: deletedUsers,
  })
}

/**
 * How many stray accounts one run is willing to collect.
 *
 * Still a bound - a sweep that walks the whole user table is a sweep that
 * starts timing out on the day the product works - but it now bounds *the
 * work* rather than *the window the work is visible through*, which is the
 * distinction the previous version got wrong.
 *
 * It used to page `listUsers` ten pages deep and filter in TypeScript, and the
 * comment beside it claimed anything missed this hour would be collected next
 * hour. That was false: `listUsers` returns a stable order, so it was the same
 * two thousand accounts every run, and everything past the boundary was never
 * looked at again. The accounts that fall behind it are the oldest ones - which
 * is exactly the set this job exists to delete.
 *
 * `stray_guest_ids` applies the filter in Postgres and orders oldest first, so
 * a capped run drains a backlog instead of re-reading the same slice. See its
 * migration.
 */
const MAX_STRAYS = 2000

/** Anonymous accounts older than the cutoff, whatever became of their rows. */
async function listStrayGuests(
  admin: ReturnType<typeof createAdminClient>,
  cutoff: string,
): Promise<string[]> {
  const { data, error } = await admin.rpc('stray_guest_ids', {
    p_older_than: cutoff,
    p_limit: MAX_STRAYS,
  })

  // Not fatal. The expired rows above are already swept and their candidates
  // are still worth collecting, so a failure here costs this hour's extra
  // tidying rather than the run.
  if (error || !data) return []

  return data.map((id) => String(id))
}
