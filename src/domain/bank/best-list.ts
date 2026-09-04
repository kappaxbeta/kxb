import 'server-only'
import type { Client } from '@/es/store'

/**
 * A space's players, ranked by what they have.
 *
 * `docs/product/economy.md` §13. The streak board ranks *turning up*; this
 * ranks playing, and the two are deliberately different tables rather than two
 * columns of one - a streak is the gentle ranking (the number only goes up by
 * being here, there is nobody to beat), and coins are the one where somebody
 * can be ahead of you.
 *
 * ---------------------------------------------------------------------------
 * Ranked in SQL, unlike the streak board
 * ---------------------------------------------------------------------------
 * `readLeaderboard` sorts in TypeScript because the number people are ranked by
 * is not the stored column - a run that has gone cold sorts as zero however
 * tall it once was. Coins have no such wrinkle: the stored number *is* the
 * number, so the index does the work.
 */

export interface BestListRow {
  userId: string
  coins: number
  /** Lifetime café takings, as the tie-breaker and its own small badge. */
  earned: number
  /**
   * Hidden from everybody else's copy of this list.
   *
   * Only ever true on the viewer's *own* row - see `readBestList`. It exists so
   * a surface can choose to say nothing at all rather than accidentally
   * revealing the state by drawing a row differently.
   */
  hidden: boolean
}

/**
 * Who an operator has hidden here, if this space is one where that applies.
 *
 * **Private spaces only**, and the check is here rather than on the table
 * because whether a space is public is a column that changes independently: a
 * constraint would go stale, and a trigger chasing it would be machinery for a
 * rule that is read far more often than it is written.
 *
 * A space that becomes public therefore stops honouring its hidden rows rather
 * than carrying them across, which is the safe direction. The argument is the
 * whole justification for the feature: a public leaderboard that operators
 * silently adjust is a lie told to strangers who have no way to know it, and a
 * private space's ranking is a community's own business.
 *
 * Read with whatever client the caller has. `leaderboard_hidden` has RLS on and
 * *no policies*, so a member's session sees an empty set - which fails in the
 * generous direction here: the worst case is a hidden player appearing, not a
 * visible one vanishing.
 */
async function hiddenIn(
  supabase: Client,
  tenantId: string,
): Promise<ReadonlySet<string>> {
  const { data: space } = await supabase
    .from('tenants_read_model')
    .select('is_public_lounge')
    .eq('id', tenantId)
    .maybeSingle()

  // Public, or unreadable. Either way nothing is hidden: an unreadable space is
  // not a licence to start editing a ranking.
  if (space?.is_public_lounge !== false) return new Set()

  const { data } = await supabase
    .from('leaderboard_hidden')
    .select('user_id')
    .eq('tenant_id', tenantId)

  return new Set((data ?? []).map((row) => row.user_id))
}

/**
 * The best list, as this viewer should see it.
 *
 * ---------------------------------------------------------------------------
 * The viewer's own row is never removed, and that is what makes it a *shadow*
 * ---------------------------------------------------------------------------
 * A list that visibly loses you is a notification. Somebody who can tell they
 * have been hidden makes another account, and the moderation was worse than
 * doing nothing - it taught them what to avoid.
 *
 * So a hidden player still sees themselves, at the rank they would have held,
 * and everybody else's copy simply does not contain them. The rank is *not*
 * recomputed for other viewers either: positions come from the full ordering,
 * so a hidden player's absence leaves no gap anybody can count.
 */
export async function readBestList(
  supabase: Client,
  tenantId: string,
  viewerId: string,
  limit = 100,
): Promise<BestListRow[]> {
  const [{ data, error }, hidden] = await Promise.all([
    supabase
      .from('homestead_read_model')
      .select('user_id, coins, earned')
      .eq('tenant_id', tenantId)
      .order('coins', { ascending: false })
      .limit(limit),
    hiddenIn(supabase, tenantId),
  ])

  if (error) throw new Error(`Failed to read the best list: ${error.message}`)

  return (data ?? [])
    .filter((row) => !hidden.has(row.user_id) || row.user_id === viewerId)
    .map((row) => ({
      userId: row.user_id,
      coins: row.coins,
      earned: row.earned,
      hidden: hidden.has(row.user_id),
    }))
}
