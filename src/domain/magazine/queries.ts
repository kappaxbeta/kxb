import 'server-only'
import { projectRefPrefix } from '@/domain/xps/ref'
import type { Client } from '@/es/store'

export interface MagazineEntry {
  xpRef: string
  name: string
  addedBy: string | null
  addedAt: string
}

/**
 * What is on this space's shelf, newest first.
 *
 * Newest first, unlike the room list next door, and the difference is what the
 * two lists are for. Rooms are *places* - people learn where one sits and reach
 * for it by position, so that list is oldest first and never reshuffles. A
 * magazine is a pile of things you collected, and the one you just added is the
 * one you are most likely to want.
 */
export async function listMagazine(
  supabase: Client,
  tenantId: string,
): Promise<MagazineEntry[]> {
  const { data, error } = await supabase
    .from('magazine_read_model')
    .select('xp_ref, name, added_by, added_at')
    .eq('tenant_id', tenantId)
    .order('added_at', { ascending: false })

  if (error) throw new Error(`Failed to list the magazine: ${error.message}`)

  return (data ?? []).map((row) => ({
    xpRef: row.xp_ref,
    name: row.name,
    addedBy: row.added_by,
    addedAt: row.added_at,
  }))
}

/**
 * Is this *project* on the shelf, at any version?
 *
 * The question a project's own page asks, and it cannot be `inMagazine`: a
 * reference carries its version, so the row from before this morning's save
 * names `p-<uuid>-v3` while the page is looking at v4. Asked by version, a
 * project would fall off its own shelf every time somebody worked on it.
 *
 * The prefix, and `projectRefPrefix` rather than a `like` built here, for the
 * reason that helper exists: the trailing `-v` is what makes it safe to match
 * on, and a second place that knows how a reference is spelled is a second
 * place that can be wrong about it.
 *
 * Returns the reference the shelf actually holds, because that is what putting
 * it back has to name - the same pair `splitShelf` deals in.
 */
export async function shelvedProject(
  supabase: Client,
  tenantId: string,
  xpId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('magazine_read_model')
    .select('xp_ref')
    .eq('tenant_id', tenantId)
    .like('xp_ref', `${projectRefPrefix(xpId)}%`)
    .order('added_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.xp_ref ?? null
}

/**
 * Is this XP already on the shelf?
 *
 * Asked by the button that puts it there, so it can say "in your magazine"
 * rather than offering to add it again. The decider treats a second take-in as
 * a no-op, so this is a copy decision rather than a correctness one.
 */
export async function inMagazine(
  supabase: Client,
  tenantId: string,
  xpRef: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('magazine_read_model')
    .select('xp_ref')
    .eq('tenant_id', tenantId)
    .eq('xp_ref', xpRef)
    .maybeSingle()

  return data !== null
}
