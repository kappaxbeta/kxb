import 'server-only'
import { DEFAULT_DOOR, type DoorMode, type PlaceId } from '@/domain/homestead/events'
import { readDisplayName, readUsernames } from '@/domain/profile/username-queries'
import type { Client } from '@/es/store'

export interface HomesteadProp {
  tile: string
  propId: string
  rotY: number
  topper?: { propId: string; rotY: number }
}

export interface HomesteadView {
  coins: number
  served: number
  earned: number
  /** Furniture in the requested place only. */
  props: HomesteadProp[]
  /** Ground bought beyond the opening plan, in the requested place. */
  ground: string[]
  /** Who may come in. See `DoorMode`. */
  door: DoorMode
}

/**
 * One place's contents, plus the purse that member's homestead shares.
 *
 * Scoped to a single place rather than returning all three, because a page only
 * ever draws one and the café's furniture is of no use to the garden. The purse
 * comes along regardless - it is shared, and every place needs to show it.
 *
 * A workspace that has never opened one reads as zero coins and an empty room.
 * The caller founds it; see `foundHomestead` in ./actions.ts.
 */
export async function readHomestead(
  supabase: Client,
  tenantId: string,
  userId: string,
  place: PlaceId,
): Promise<HomesteadView> {
  const [purse, props, ground] = await Promise.all([
    supabase
      .from('homestead_read_model')
      .select('coins, served, earned, access_mode')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('homestead_props_read_model')
      .select('tile, prop_id, rot_y, topper_id, topper_rot_y')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('place', place)
      .limit(2000),
    supabase
      .from('homestead_ground_read_model')
      .select('tile')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('place', place)
      .limit(2000),
  ])

  if (purse.error) {
    throw new Error(`Failed to load the homestead: ${purse.error.message}`)
  }
  if (props.error) {
    throw new Error(`Failed to load the furniture: ${props.error.message}`)
  }
  if (ground.error) {
    throw new Error(`Failed to load the ground: ${ground.error.message}`)
  }

  return {
    coins: purse.data?.coins ?? 0,
    served: purse.data?.served ?? 0,
    earned: purse.data?.earned ?? 0,
    props: (props.data ?? []).map((row) => ({
      tile: row.tile,
      propId: row.prop_id,
      rotY: row.rot_y,
      topper: row.topper_id
        ? { propId: row.topper_id, rotY: row.topper_rot_y ?? 0 }
        : undefined,
    })),
    ground: (ground.data ?? []).map((row) => row.tile),
    // A homestead being founded in the same request that reads it has no row
    // yet. Falling back to the strict default rather than to `open` means the
    // race, if it ever happens, leaves a door shut rather than ajar.
    door: asDoor(purse.data?.access_mode),
  }
}

/**
 * Narrow whatever the column held into a door mode.
 *
 * The check constraint makes anything else impossible in practice, so this is
 * about the *type* rather than the data: the generated row type is `string`,
 * and the alternative to narrowing here is a cast at every call site.
 */
function asDoor(value: string | null | undefined): DoorMode {
  return value === 'open' || value === 'knock' || value === 'closed'
    ? value
    : DEFAULT_DOOR
}

/**
 * Resolve one member of this workspace, for a visit.
 *
 * The check that `of=<uuid>` names an actual colleague, and the reason it is a
 * query rather than a cast. Without it any uuid in the query string would render
 * an empty homestead - the read model is tenant-scoped, so a stranger's id
 * simply matches no rows - and an empty house is indistinguishable from a real
 * one somebody has stripped bare. A 404 says what actually happened.
 *
 * Returns null for a non-member, which the page turns into `notFound()`.
 */
export async function readNeighbour(
  supabase: Client,
  tenantId: string,
  userId: string,
): Promise<{ userId: string; name: string } | null> {
  const { data, error } = await supabase
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to find that member: ${error.message}`)
  }
  if (!data) return null

  return { userId: data.user_id, name: await readDisplayName(supabase, data.user_id) }
}

/** One neighbour's front door, for the list of places you could go. */
export interface NeighbourView {
  userId: string
  /** Their username, which is what members see each other by. */
  name: string
  door: DoorMode
  served: number
}

/**
 * Everybody in the workspace who has a homestead, and whether you may walk in.
 *
 * Two queries rather than a join, because the homestead read model and the
 * member roster are different aggregates' projections and joining them in SQL
 * would couple two things that are only related in the UI.
 *
 * The door is included on purpose - a list that showed every neighbour as
 * equally reachable would send you knocking on doors that are bolted shut, and
 * the refusal would arrive only after you had travelled there.
 */
export async function listNeighbours(
  supabase: Client,
  tenantId: string,
  /** Left out of the result: your own front door is not somewhere you visit. */
  selfId: string,
): Promise<NeighbourView[]> {
  const { data: homes, error } = await supabase
    .from('homestead_read_model')
    .select('user_id, access_mode, served')
    .eq('tenant_id', tenantId)
    .limit(500)

  if (error) {
    throw new Error(`Failed to list the neighbours: ${error.message}`)
  }

  const others = (homes ?? []).filter((row) => row.user_id !== selfId)
  if (others.length === 0) return []

  const { data: members, error: memberError } = await supabase
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in(
      'user_id',
      others.map((row) => row.user_id),
    )

  if (memberError) {
    throw new Error(`Failed to name the neighbours: ${memberError.message}`)
  }

  const names = await readUsernames(
    supabase,
    (members ?? []).map((row) => row.user_id),
  )

  return others
    .map((row) => ({
      userId: row.user_id,
      // A homestead whose owner has since left the workspace still has a row.
      // Naming them 'Someone' is better than dropping the entry, which would
      // read as the house having vanished.
      name: names.get(row.user_id) ?? 'Someone',
      door: asDoor(row.access_mode),
      served: row.served ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Whether this workspace has ever opened a homestead. */
export async function homesteadExists(
  supabase: Client,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('homestead_read_model')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to check the homestead: ${error.message}`)
  }
  return data !== null
}
