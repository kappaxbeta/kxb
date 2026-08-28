import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Collecting the accounts that no token vouches for any more.
 *
 * A guest account is not an account anybody has. Nobody signed up for it, there
 * is no password and no address to send one to, and nothing can sign back into
 * it - `enterAsGuest` mints a fresh one every time a link is followed. The only
 * thing that ever made one meaningful is a row in `tenant_guests` saying "this
 * session was admitted somewhere".
 *
 * So the moment its last admission goes, the account is a permanent row in
 * `auth.users` that no longer refers to anybody. The reaper on the cron sweeps
 * those up eventually, but eventually is hours, and it only looks at rows that
 * *expired* - an admission that was revoked or ejected leaves no row to expire,
 * so its account was never collected at all. Every revoked link was leaving
 * behind one dead account per person it had admitted, forever.
 *
 * This is the same act done at the moment it becomes true rather than on a
 * timer: after anything removes admissions, hand the ids here and whichever of
 * them have none left are deleted.
 *
 * Its own module because both `guests/actions.ts` (a `'use server'` file, where
 * every export must be an async action) and `guests/match-links.ts` call it.
 */

/**
 * Delete the anonymous accounts among these ids that hold no admission.
 *
 * Two guards, both load-bearing:
 *
 *   - **Still admitted somewhere?** A guest can hold rows in more than one
 *     space, or through more than one link in the same space. Revoking one of
 *     them is not the end of their session, and deleting the account would sign
 *     them out of a room they are legitimately standing in.
 *   - **Actually anonymous?** `guest_id` has no foreign key - that is what lets
 *     a guest exist without an account - so nothing at the database level stops
 *     a stray value here from naming a real member. The cron reaper makes this
 *     same check for the same reason; it matters more here, because this runs
 *     from a button rather than from a schedule.
 *
 * Never throws. This is tidying that hangs off somebody revoking a link, and a
 * failure to collect an account must not turn their revocation into an error.
 */
export async function reapOrphanedGuests(guestIds: string[]): Promise<number> {
  const ids = [...new Set(guestIds)].filter(Boolean)
  if (ids.length === 0) return 0

  const admin = createAdminClient()
  let deleted = 0

  // One query for the whole batch rather than one per id: revoking a link with
  // a dozen people behind it should not be a dozen round trips.
  const { data: surviving, error } = await admin
    .from('tenant_guests')
    .select('guest_id')
    .in('guest_id', ids)

  if (error) {
    console.warn(`could not check guest admissions: ${error.message}`)
    return 0
  }

  const stillAdmitted = new Set((surviving ?? []).map((row) => row.guest_id))

  for (const id of ids) {
    if (stillAdmitted.has(id)) continue

    try {
      const { data: found } = await admin.auth.admin.getUserById(id)
      if (!found?.user) continue
      if (!found.user.is_anonymous) continue

      const { error: deleteError } = await admin.auth.admin.deleteUser(id)
      if (deleteError) throw new Error(deleteError.message)
      deleted++
    } catch (failure) {
      // One undeletable account must not strand the rest, exactly as in the
      // cron reaper.
      console.warn(
        `could not delete orphaned guest ${id}: ${
          failure instanceof Error ? failure.message : 'unknown'
        }`,
      )
    }
  }

  return deleted
}

/**
 * Who a set of links has admitted, read before the admissions are removed.
 *
 * Has to be a separate call taken *first*: once the rows are deleted there is
 * nothing left to say whose accounts they were, and the ids are the only handle
 * on the accounts to collect.
 */
export async function guestsAdmittedBy(linkIds: string[]): Promise<string[]> {
  if (linkIds.length === 0) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tenant_guests')
    .select('guest_id')
    .in('link_id', linkIds)

  if (error) {
    console.warn(`could not read guests for links: ${error.message}`)
    return []
  }

  return (data ?? []).map((row) => row.guest_id)
}
