import 'server-only'
import { battleDestination } from '@/domain/guests/application'
import { guestsAdmittedBy, reapOrphanedGuests } from '@/domain/guests/orphans'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The links minted for one match, and taking them back when it empties.
 *
 * A guest link carries a destination (see `guestArrival`), and the invite
 * button inside a battle room sets it to that match. So a match's links are
 * findable by exactly the path they let out at - there is no join table, and
 * there does not need to be one.
 *
 * Why they need taking back at all: a link handed out mid-game is the most
 * casual thing in the app to create - one click, pasted into a chat - and it
 * outlives the game by twelve hours. The match ends, everybody wanders off, and
 * the token is still live in somebody's message history, still admitting
 * strangers into a space, to stand alone in an arena where nothing is
 * happening. Nobody revokes those by hand, because nobody thinks about them
 * again once the match is over.
 *
 * Its own module rather than a function in guests/actions.ts, because that file
 * is `'use server'` and every export of one must be an async server action -
 * this is called from another action, not from a client.
 */

/**
 * Kill the links that let out into this match.
 *
 * Revoked, not deleted, for the reason `revokeGuestLink` gives: the row is the
 * record that access was granted, and "how did they get in" should stay
 * answerable after the fact.
 *
 * It ejects the guests those links admitted, and collects the anonymous
 * accounts left with no admission anywhere - the same sequence, in the same
 * order, that `revokeGuestLink` performs. Revoking a link that leaves its
 * guests standing in the room is the behaviour nobody wants, and an account
 * that no token vouches for any more is a permanent `auth.users` row referring
 * to nobody.
 *
 * This only fires when the *last* participant leaves, so "the guests it
 * admitted" are people whose match has already emptied out around them.
 *
 * Runs through the service role because `guest_links` has no write policy at
 * all - see the migration. It is called from a path that has already proved the
 * caller belongs to the match, and it names the tenant explicitly so a battle id
 * from elsewhere cannot reach another space's links.
 *
 * Never throws. This is housekeeping hanging off somebody pressing "leave", and
 * failing to tidy up must not turn their exit into an error.
 */
export async function revokeLinksForBattle(
  tenantId: string,
  slug: string,
  battleId: string,
): Promise<number> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('guest_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('destination', battleDestination(slug, battleId))
      .is('revoked_at', null)
      .select('id')

    if (error) throw new Error(error.message)

    const linkIds = (data ?? []).map((row) => row.id)
    if (linkIds.length === 0) return 0

    // Read the admissions before removing them - the ids are the only handle on
    // the accounts to collect afterwards.
    const admitted = await guestsAdmittedBy(linkIds)

    const { error: ejectError } = await admin
      .from('tenant_guests')
      .delete()
      .eq('tenant_id', tenantId)
      .in('link_id', linkIds)

    if (ejectError) throw new Error(ejectError.message)

    await reapOrphanedGuests(admitted)

    return linkIds.length
  } catch (error) {
    console.warn(
      `could not revoke guest links for battle ${battleId}: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
    )
    return 0
  }
}
