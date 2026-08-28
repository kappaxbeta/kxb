import 'server-only'
import type { XpRight } from '@/domain/xps/events'
import type { Client } from '@/es/store'

/**
 * What one person was granted on one project.
 *
 * Its own tiny module rather than a function in `queries.ts`, because every
 * caller of the permission ladder needs exactly this one row and nothing else
 * in that file — and because a grant lookup that lived beside the listing
 * queries would eventually be answered from a listing, which is a join nobody
 * meant to write.
 *
 * Null covers both "no grant" and "the row is not visible to this caller".
 * `xp_grants_select` admits your own grants and the grants on projects you may
 * read, so those two cases are the same answer for the same reason: a grant you
 * cannot see is a grant you do not have.
 */
export async function readGrant(
  supabase: Client,
  xpId: string,
  accountId: string,
): Promise<XpRight | null> {
  const { data, error } = await supabase
    .from('xp_grants')
    .select('right')
    .eq('xp_id', xpId)
    .eq('account_id', accountId)
    .maybeSingle()

  // A failed read is not a grant. Falling back to "no access" is the direction
  // `DEFAULT_TIER` argues for applied here: the recoverable mistake is telling
  // somebody they cannot edit something they can.
  if (error || !data) return null
  return data.right as XpRight
}

/** Everybody a project is shared with, for the Share panel. */
export async function listGrants(
  supabase: Client,
  xpId: string,
): Promise<{ accountId: string; right: XpRight }[]> {
  const { data, error } = await supabase
    .from('xp_grants')
    .select('account_id, right')
    .eq('xp_id', xpId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to list who this is shared with: ${error.message}`)
  return (data ?? []).map((row) => ({ accountId: row.account_id, right: row.right as XpRight }))
}
