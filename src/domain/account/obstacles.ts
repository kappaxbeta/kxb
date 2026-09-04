import 'server-only'
import type { Client } from '@/es/store'

/**
 * What stands between somebody and the end of their account.
 *
 * ---------------------------------------------------------------------------
 * Only one thing does, and it is not about them
 * ---------------------------------------------------------------------------
 * Closing an account walks out of every space it is in. For almost every space
 * that is a `MemberLeft` and nothing else - the space carries on, run by the
 * people still in it. The exception is the one the tenant aggregate already
 * refuses: *the last owner cannot leave*. A space whose last owner walked out
 * has nobody who can invite, rename, archive or pay for it, and the platform
 * has one of those already - see the note about the kxb space, which is pinned
 * to the free tier for exactly this reason.
 *
 * So this is not a "are you sure" list and not a sanity check on the person.
 * It is the set of spaces that would be left leaderless, and the account cannot
 * close until each one has been handed over or archived. The check is here
 * *before* anything is written, because half a closure is the outcome to avoid:
 * an account that has left four spaces and then hit a refusal on the fifth is
 * in a state nobody asked for and nobody can undo.
 *
 * ---------------------------------------------------------------------------
 * A space with nobody else in it is not an obstacle
 * ---------------------------------------------------------------------------
 * Somebody's own workspace, that they made and nobody else ever joined, has no
 * one to hand it to. Demanding they archive it by hand first would be a chore
 * with exactly one possible outcome, so `closeAccount` archives those itself.
 * They are counted here (`archiving`) so the confirmation can say how many
 * rather than being silent about it.
 */

export interface CloseObstacles {
  /**
   * Spaces that must be dealt with by hand: this person is the only owner and
   * somebody else is in there.
   */
  handOver: { slug: string; name: string }[]
  /** Spaces that will be archived on the way out, because nobody else is in them. */
  archiving: { slug: string; name: string }[]
  /** Spaces that will simply be left. */
  leaving: { slug: string; name: string }[]
}

/** Nothing in the way, and nothing to do. The empty answer, written once. */
export const NO_OBSTACLES: CloseObstacles = { handOver: [], archiving: [], leaving: [] }

/**
 * Sort this account's spaces into the three piles above.
 *
 * Read with the caller's own client rather than an admin one, deliberately:
 * every space in the answer is one they are a member of, `tenant_members` is
 * readable to members, and a question about somebody's own spaces should not
 * need a key that can read everybody's.
 *
 * Guests are not counted as "somebody else". A `tenant_guests` row is a session
 * that ends, not a person the space belongs to - a space whose only other
 * occupant is a visitor who followed a link is a space with nobody in it, and
 * making somebody chase down a guest before they may close their account would
 * be an obstacle that dissolves on its own within the hour.
 */
export async function closeObstacles(
  supabase: Client,
  userId: string,
): Promise<CloseObstacles> {
  const { data: mine, error } = await supabase
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to read your spaces: ${error.message}`)
  if (!mine || mine.length === 0) return NO_OBSTACLES

  const ids = mine.map((row) => row.tenant_id)

  /**
   * Everybody in all of those spaces, in one query.
   *
   * The two questions each space raises - "am I its only owner" and "is anybody
   * else here" - are both answered by this one list, and asking them per space
   * would be two round trips per space on a page somebody opens once.
   */
  const { data: everyone, error: peopleError } = await supabase
    .from('tenant_members')
    .select('tenant_id, user_id, role')
    .in('tenant_id', ids)

  if (peopleError) throw new Error(`Failed to read your spaces: ${peopleError.message}`)

  const { data: named } = await supabase
    .from('tenants_read_model')
    .select('id, slug, name, archived')
    .in('id', ids)

  const byId = new Map((named ?? []).map((row) => [row.id, row]))

  const result: CloseObstacles = { handOver: [], archiving: [], leaving: [] }

  for (const membership of mine) {
    const space = byId.get(membership.tenant_id)
    // A membership whose space has not been projected yet, or one already
    // archived. Neither is an obstacle: an archived space needs no owner, and
    // an unprojected one is a row this page cannot name. `closeAccount` leaves
    // both the same way it leaves anything else.
    if (!space || space.archived) continue

    const where = { slug: space.slug, name: space.name }
    const people = (everyone ?? []).filter((row) => row.tenant_id === membership.tenant_id)
    const others = people.filter((row) => row.user_id !== userId)
    const otherOwners = others.filter((row) => row.role === 'owner')

    if (membership.role !== 'owner' || otherOwners.length > 0) {
      result.leaving.push(where)
    } else if (others.length === 0) {
      result.archiving.push(where)
    } else {
      result.handOver.push(where)
    }
  }

  return result
}
