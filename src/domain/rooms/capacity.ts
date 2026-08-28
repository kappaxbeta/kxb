import type { EventView } from '@/domain/events/queries'
import type { RoomView } from '@/domain/rooms/queries'

/**
 * The rules about how full a room is, with nothing that touches a database.
 *
 * Split from `occupancy.ts` for the reason `application.ts` is split from
 * `queries.ts` elsewhere in this codebase: that file imports `server-only`, and
 * a module that does cannot be imported by a test. These are the decisions
 * worth testing - which room somebody gets sent to, and whose cap wins - so
 * they live where a test can reach them.
 */

export interface RoomOccupancy {
  roomId: string
  /** Heads inside within the heartbeat window. */
  count: number
  /** The cap in force: the room's own, else the event's, else null for none. */
  cap: number | null
  full: boolean
}

/**
 * The cap in force for one room.
 *
 * The room's own answer wins, then the event's, then there is no cap. Mirrors
 * `room_cap()` in supabase/migrations/20260826000000_event_spaces.sql exactly -
 * that SQL is what the door actually enforces, and this is the same rule for
 * anything already holding the rows.
 */
export function capFor(room: RoomView, event: EventView | null): number | null {
  if (typeof room.cap === 'number') return room.cap
  return event ? event.roomCap : null
}

/**
 * Where to send somebody who wanted a room that is full.
 *
 * The *emptiest* room with space, not the first one, and that is the whole
 * decision this function exists to make. Filling rooms one at a time would be
 * the obvious implementation and it is the expensive one: movement cost is
 * quadratic in a room's population, so two rooms of eight cost half what one
 * room of sixteen does for the same eighty-person event. Spreading arrivals out
 * is not politeness, it is the thing that keeps the space's frames flowing.
 *
 * Null when every other room is full, which is when the caller considers
 * overflow.
 */
export function roomWithSpace(
  rooms: RoomView[],
  occupancy: Map<string, RoomOccupancy> | Record<string, RoomOccupancy>,
  exclude: string,
): RoomView | null {
  const at = (id: string): RoomOccupancy | undefined =>
    occupancy instanceof Map ? occupancy.get(id) : occupancy[id]

  const candidates = rooms
    .filter((room) => room.roomId !== exclude)
    .filter((room) => !(at(room.roomId)?.full ?? false))
    .sort((a, b) => (at(a.roomId)?.count ?? 0) - (at(b.roomId)?.count ?? 0))

  return candidates[0] ?? null
}
