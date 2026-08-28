import 'server-only'
import type { EventView } from '@/domain/events/queries'
import { capFor, type RoomOccupancy } from '@/domain/rooms/capacity'
import type { RoomView } from '@/domain/rooms/queries'
import type { Client } from '@/es/store'

export { capFor, roomWithSpace } from '@/domain/rooms/capacity'
export type { RoomOccupancy } from '@/domain/rooms/capacity'

/**
 * How full each room is, right now.
 *
 * ----------------------------------------------------------------------------
 * Why a cap exists at all
 * ----------------------------------------------------------------------------
 * Not comfort, and not moderation. Movement is broadcast at `SEND_HZ` to every
 * other person in the room, so a room of N costs `SEND_HZ x N x (N-1)`
 * deliveries a second - quadratic in its population and only linear in the
 * number of rooms. The Realtime budget is per *tenant*, so one room of thirty
 * takes frames away from every other room in the space, and the symptom is
 * everybody stuttering rather than the crowded room being slow. See
 * performancestudy/coalescing-design.md.
 *
 * That is the failure this file exists to prevent, and it is worth stating
 * because a cap that looks like a comfort setting is a cap somebody raises to
 * be generous.
 *
 * ----------------------------------------------------------------------------
 * Why the count is a table rather than presence
 * ----------------------------------------------------------------------------
 * Occupancy lives on a Realtime channel, which the server cannot read on a
 * self-hosted stack. `world_occupancy` is heartbeat rows with a twenty-second
 * life - see the migration - and the count honours the clock rather than the
 * reaper, so somebody who closed their tab frees their place immediately.
 */

/**
 * Occupancy for a whole list of rooms, in one query.
 *
 * One round trip rather than one per room, because the picker renders every
 * room at once and an event has a dozen of them. The count is done here in
 * TypeScript rather than by a SQL `group by` for a duller reason than it looks:
 * PostgREST cannot express a grouped aggregate through the client without a
 * view or an RPC, and adding either to count rows in a table this small is more
 * machinery than the problem deserves.
 */
export async function roomOccupancy(
  supabase: Client,
  tenantId: string,
  rooms: RoomView[],
  event: EventView | null,
): Promise<Map<string, RoomOccupancy>> {
  const result = new Map<string, RoomOccupancy>()
  if (rooms.length === 0) return result

  // Twenty seconds, matching `occupancy_ttl()` in the migration. Written out
  // rather than read from the database because it is a constant either side and
  // a round trip to learn it would cost more than the risk of it drifting -
  // which the SQL-level tests catch.
  const since = new Date(Date.now() - 20_000).toISOString()

  const { data, error } = await supabase
    .from('world_occupancy')
    .select('world_id')
    .eq('tenant_id', tenantId)
    .gt('seen_at', since)
    .in(
      'world_id',
      rooms.map((room) => room.roomId),
    )

  // A failed count must not close every door in the space. Falling back to
  // "empty" lets people in, which is the direction an outage should fail: the
  // cost is a room that briefly goes over, and the alternative is an event
  // where nobody can enter anything.
  const counts = new Map<string, number>()
  if (!error) {
    for (const row of data ?? []) {
      const id = (row as { world_id: string }).world_id
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }

  for (const room of rooms) {
    const count = counts.get(room.roomId) ?? 0
    const cap = capFor(room, event)
    result.set(room.roomId, {
      roomId: room.roomId,
      count,
      cap,
      full: cap !== null && count >= cap,
    })
  }

  return result
}
