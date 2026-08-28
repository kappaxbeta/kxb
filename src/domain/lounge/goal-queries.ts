import 'server-only'
import type { Goal } from '@/domain/lounge/goal-events'
import { MAX_GOALS_PER_WORLD } from '@/domain/lounge/goal-events'
import type { Client } from '@/es/store'

/**
 * Every goal standing in a world.
 *
 * Not paged, like the images and unlike the blocks: a world holds thousands of
 * blocks and at most a handful of goals, so one request is both correct and
 * nowhere near the response ceiling that forced the block query to page.
 *
 * Keyed by world rather than by tenant, which is the whole reason goals are not
 * simply images with a colour - a saved battlefield has to carry its goals with
 * it, and the lounge is just the world whose id happens to equal the tenant's.
 */
export async function listGoals(
  supabase: Client,
  tenantId: string,
  worldId: string,
): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('lounge_goals_read_model')
    .select('id, kind, x, y, z, width, height, facing')
    .eq('tenant_id', tenantId)
    .eq('world_id', worldId)
    .eq('deleted', false)
    .order('created_at', { ascending: true })
    // One more than a world may hold, so a world that somehow exceeded the cap
    // still loads rather than silently dropping a goal people can score in.
    .limit(MAX_GOALS_PER_WORLD + 1)

  if (error) {
    throw new Error(`Failed to load goals: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    // The column is a checked text; the domain's type is the union. The check
    // constraint is what makes this cast honest.
    kind: row.kind as Goal['kind'],
    x: row.x,
    y: row.y,
    z: row.z,
    width: row.width,
    height: row.height,
    facing: row.facing,
  }))
}

/** How many goals a world already has, for the cap on placing another. */
export async function countGoals(
  supabase: Client,
  tenantId: string,
  worldId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('lounge_goals_read_model')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('world_id', worldId)
    .eq('deleted', false)

  if (error) {
    throw new Error(`Failed to count goals: ${error.message}`)
  }

  return count ?? 0
}
