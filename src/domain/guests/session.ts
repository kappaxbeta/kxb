import 'server-only'
import type { Client } from '@/es/store'

/**
 * What still makes an anonymous session a visit, and how one is closed.
 *
 * ---------------------------------------------------------------------------
 * The bug this exists to end
 * ---------------------------------------------------------------------------
 * A guest account is minted by `enterAsGuest` and is meaningful only for as
 * long as a `tenant_guests` row points at it. Four things remove that row - the
 * twelve hours run out, a host revokes the link, an admin shows them the door,
 * or the cron sweeps it - and until this module existed *none* of them touched
 * the cookie in the browser. The account stayed signed in to a visit that no
 * longer existed.
 *
 * That is not a tidiness problem. `landingPath` sends an anonymous session with
 * no admission to `/g/left`, and every way off that page leads back through
 * `/` or `/signup`, both of which send it to `/g/left` again. So a browser in
 * that state could not reach the product at all - not the landing page, not
 * sign-up, not a fresh guest link. Typing the domain in produced the goodbye
 * screen, forever, and the only cure was clearing site data.
 *
 * The fix is to stop treating "your visit ended" as a thing to *say* and start
 * treating it as a thing to *do*. `/g/left` is where the app already admits the
 * visit is over; the proxy closes the session on the way in to it, so the page
 * renders for somebody who is signed out and every link on it works.
 *
 * ---------------------------------------------------------------------------
 * Why the question lives here rather than in three places
 * ---------------------------------------------------------------------------
 * "Does anything still vouch for this session" was written out three times -
 * in `guestLanding`, in `tenant_role()`, and nowhere at all in the proxy, which
 * is how the loop got in. Two of those can now share one function; the third is
 * SQL and stays SQL, but the clauses are identical and the comment on
 * `tenant_role()` says so.
 *
 * The clauses are the whole definition, and both are load-bearing:
 *
 *   - `admitted_at is not null` - somebody standing at a door they knocked on
 *     is not in the space yet. Signing them out mid-knock would throw away the
 *     form they just filled in.
 *   - `expires_at > now()` - the pass is what makes it a visit, not the row.
 */

/**
 * The page that says a visit is over, named once - in `left-path.ts`, which
 * has no `server-only` on it because the guest's own tab needs the name too
 * (see `GuestPulse`). Re-exported here so the three server modules that point
 * at it - `requireTenant`, `landingPath` and the proxy - keep reading it from
 * the module that explains it.
 */
export { GUEST_LEFT_PATH } from '@/domain/guests/left-path'

/**
 * The live admission behind a session, or null if nothing vouches for it.
 *
 * Throws rather than answering null when the read itself fails, and the
 * distinction is the point: "no admission" and "could not tell" lead to
 * opposite acts. A caller that is about to end somebody's session must not do
 * it because the database blinked. Callers that only want somewhere to send a
 * page may treat a failure as a null, and `guestLanding` does.
 */
export async function liveAdmission(
  supabase: Client,
  userId: string,
): Promise<{ tenant_id: string; link_id: string | null } | null> {
  const { data, error } = await supabase
    .from('tenant_guests')
    .select('tenant_id, link_id')
    .eq('guest_id', userId)
    .not('admitted_at', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`could not read admissions: ${error.message}`)

  return data ?? null
}

/**
 * Close an anonymous session that no admission vouches for any more.
 *
 * Answers false and touches nothing when the session is still a visit, which is
 * the case worth being careful about: a guest can hold admissions in more than
 * one space, and one of them ending is not the end of their session. `/g/left`
 * is reached with a slug in `?from=` precisely because it can be the goodbye for
 * one space while another is still open.
 *
 * Only the session. The orphaned `auth.users` row is litter rather than access -
 * nothing can sign back into it, and `tenant_role()` has already stopped
 * recognising it - so it is left to the reaper, which sweeps hourly and does not
 * need the service role key to exist in this layer to do it.
 */
export async function closeEndedVisit(
  supabase: Client,
  user: { id: string; is_anonymous?: boolean },
): Promise<boolean> {
  if (!user.is_anonymous) return false

  try {
    if (await liveAdmission(supabase, user.id)) return false

    await supabase.auth.signOut()
    return true
  } catch (failure) {
    /**
     * Fails towards leaving the session alone, which is the safe direction
     * here and not the obvious one. The cost of not signing out is that the
     * goodbye page is shown twice; the cost of signing out on a bad read is
     * throwing somebody out of a room they are standing in, with an anonymous
     * session there is no way to sign back in to.
     */
    console.warn(
      `could not close ended visit ${user.id}: ${
        failure instanceof Error ? failure.message : 'unknown'
      }`,
    )
    return false
  }
}
