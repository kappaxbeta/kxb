import 'server-only'
import type { Client } from '@/es/store'
import type { PlaceId } from '@kxb/peepz-world/places'

/** One creature, as a scene needs it. */
export interface AgentView {
  /** The uuid. Also the seed for its entire schedule - see `seedFrom`. */
  agentId: string
  name: string
  avatar: string
}

/**
 * The creatures in one room.
 *
 * Scoped to (owner, place) rather than returning the whole roster, because a
 * scene draws one room and the badger in the garden is of no use to the café.
 *
 * Read for *visitors* as well as owners, which is the point of it living in the
 * read model rather than in each owner's tab: walking into a colleague's house
 * shows you their cat asleep in the corner, in the same spot they see it,
 * because you are both running the same schedule off the same id. Nothing is
 * broadcast and there is no host tab that has to still be open.
 *
 * The order is by adoption, so the list a scene mounts is stable across
 * re-renders and an animal does not swap models when a sibling is released.
 */
export async function readAgents(
  supabase: Client,
  tenantId: string,
  ownerId: string,
  place: PlaceId,
): Promise<AgentView[]> {
  const { data, error } = await supabase
    .from('agents_read_model')
    .select('agent_id, name, avatar')
    .eq('tenant_id', tenantId)
    .eq('owner_id', ownerId)
    .eq('place', place)
    .order('adopted_at', { ascending: true })
    .limit(64)

  if (error) {
    throw new Error(`Failed to load the creatures: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    agentId: row.agent_id,
    name: row.name,
    avatar: row.avatar,
  }))
}

/**
 * Everybody's creatures in the lounge.
 *
 * The commons is the one room where the question is not "whose place is this" -
 * nobody owns it, so an agent there belongs to the workspace's floor even though
 * it belongs to a member's roster. Hence the owner-less read: the lounge shows
 * every member's animals at once.
 *
 * Capped hard. A workspace of forty people each keeping their four is a hundred
 * and sixty rigged models in one scene, which no phone will draw - so the room
 * takes the first handful and the rest stay home. Ordering by adoption makes
 * which ones those are stable rather than a race.
 */
export async function readLoungeAgents(
  supabase: Client,
  tenantId: string,
  limit = 12,
): Promise<AgentView[]> {
  const { data, error } = await supabase
    .from('agents_read_model')
    .select('agent_id, name, avatar')
    .eq('tenant_id', tenantId)
    .eq('place', 'lounge')
    .order('adopted_at', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load the creatures: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    agentId: row.agent_id,
    name: row.name,
    avatar: row.avatar,
  }))
}
