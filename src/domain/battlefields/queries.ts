import 'server-only'
import type { BattlefieldVisibility } from '@/domain/battlefields/events'
import type { Client } from '@/es/store'

export interface BattlefieldView {
  worldId: string
  tenantId: string
  name: string
  visibility: BattlefieldVisibility
  createdAt: string
  /** Null until counted - see `withBlockCounts`. */
  blockCount: number | null
  /** The space that built it, for the cross-space search results. */
  spaceName: string | null
  spaceSlug: string | null
}

type Row = {
  world_id: string
  tenant_id: string
  name: string
  visibility: string
  created_at: string
}

function toView(row: Row): BattlefieldView {
  return {
    worldId: row.world_id,
    tenantId: row.tenant_id,
    name: row.name,
    // Anything the check constraint was later widened to accept reads as the
    // narrower option, which is the failure that reveals least.
    visibility: row.visibility === 'public' ? 'public' : 'space',
    createdAt: row.created_at,
    blockCount: null,
    spaceName: null,
    spaceSlug: null,
  }
}

/** Every arena this space has built and not retired, newest first. */
export async function listBattlefields(
  supabase: Client,
  tenantId: string,
): Promise<BattlefieldView[]> {
  const { data, error } = await supabase
    .from('battlefields_read_model')
    .select('world_id, tenant_id, name, visibility, created_at')
    .eq('tenant_id', tenantId)
    .eq('archived', false)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list battlefields: ${error.message}`)
  return (data ?? []).map(toView)
}

/**
 * One arena, by id.
 *
 * Returns null rather than throwing when it does not exist *or* when the
 * caller may not see it - the select policy makes those two cases
 * indistinguishable from here, which is the same reason `requireTenant` 404s a
 * non-member rather than telling them the workspace is real.
 */
export async function findBattlefield(
  supabase: Client,
  worldId: string,
): Promise<BattlefieldView | null> {
  const { data, error } = await supabase
    .from('battlefields_read_model')
    .select('world_id, tenant_id, name, visibility, created_at')
    .eq('world_id', worldId)
    .eq('archived', false)
    .maybeSingle()

  if (error) throw new Error(`Failed to load battlefield: ${error.message}`)
  return data ? toView(data) : null
}

/**
 * Public arenas from every space, for the "fight somewhere else" search.
 *
 * `search` matches the name, case-insensitively. The caller's own arenas are
 * excluded - they are already on the page above this one, and showing them
 * twice makes the list look like it has duplicates.
 */
export async function searchPublicBattlefields(
  supabase: Client,
  excludeTenantId: string,
  search = '',
  limit = 40,
): Promise<BattlefieldView[]> {
  let query = supabase
    .from('battlefields_read_model')
    .select('world_id, tenant_id, name, visibility, created_at')
    .eq('visibility', 'public')
    .eq('archived', false)
    .neq('tenant_id', excludeTenantId)

  const term = search.trim()
  if (term) {
    // `ilike` rather than full-text search: the corpus is arena names, which are
    // a few words each, and a tsvector index would be more machinery than a
    // list this size can justify. Escape the wildcards so a name containing a
    // percent sign searches for itself.
    query = query.ilike('name', `%${term.replace(/[%_]/g, '\\$&')}%`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to search battlefields: ${error.message}`)

  const views = (data ?? []).map(toView)
  return attachSpaces(supabase, views)
}

/**
 * Fill in which space each arena belongs to.
 *
 * One query for the whole list rather than one per row. The space name is only
 * readable for tenants whose read-model row the caller can see, so an arena
 * from a space they are not in comes back unnamed rather than failing - the
 * arena is public, the workspace's name is not necessarily.
 */
async function attachSpaces(
  supabase: Client,
  views: BattlefieldView[],
): Promise<BattlefieldView[]> {
  if (views.length === 0) return views

  const { data } = await supabase
    .from('tenants_read_model')
    .select('id, name, slug')
    .in('id', [...new Set(views.map((view) => view.tenantId))])

  const spaces = new Map((data ?? []).map((row) => [row.id, row]))

  return views.map((view) => {
    const space = spaces.get(view.tenantId)
    return {
      ...view,
      spaceName: space?.name ?? null,
      spaceSlug: space?.slug ?? null,
    }
  })
}

/**
 * How many blocks stand in each of these worlds.
 *
 * Counted here rather than maintained by the projection, because keeping a
 * running total would mean reacting to every BlocksPlaced - the hottest event
 * in the log - to serve a number that only a listing page ever reads. See the
 * note in ./projection.ts.
 *
 * `head: true` asks Postgres for the count without the rows, so this stays
 * cheap even for a world with tens of thousands of blocks.
 */
export async function withBlockCounts(
  supabase: Client,
  tenantId: string,
  views: BattlefieldView[],
): Promise<BattlefieldView[]> {
  return Promise.all(
    views.map(async (view) => {
      const { count } = await supabase
        .from('lounge_blocks_read_model')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('world_id', view.worldId)

      return { ...view, blockCount: count ?? 0 }
    }),
  )
}
